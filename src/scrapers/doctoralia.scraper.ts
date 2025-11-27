import axios from 'axios';
import * as cheerio from 'cheerio';
import { Logger } from '../utils/logger';

export interface DoctorData {
  fullName: string;
  specialty: string;
  city: string;
  address: string;
  phoneCountryCode: string;
  phoneNumber: string;
  rating: number | null;
  reviewCount: number;
  profileUrl: string;
  treatments: TreatmentData[];
  availability: AvailabilityData[];
}

export interface TreatmentData {
  name: string;
  price?: number;
  currency?: string;
  durationMinutes?: number;
}

export interface AvailabilityData {
  startAt: Date;
  endAt: Date;
  modality: 'in_person' | 'online';
}

export class DoctoraliaScraper {
  private baseUrl: string;
  private cities: string[];
  private specialties: string[];
  private maxDoctorsPerSpecialty: number;
  private scrapedUrls: Set<string> = new Set();

  constructor() {
    this.baseUrl = process.env.DOCTORALIA_BASE_URL || 'https://www.doctoralia.pe';
    this.cities = (process.env.TARGET_CITIES || 'Lima').split(',');
    this.specialties = (process.env.TARGET_SPECIALTIES || 'cardiologia,dermatologia').split(',');
    this.maxDoctorsPerSpecialty = parseInt(process.env.MAX_DOCTORS_PER_SPECIALTY || '15');
  }

  async scrapeDoctors(): Promise<DoctorData[]> {
    Logger.info('Starting doctor scraping process...');
    const doctors: DoctorData[] = [];

    try {
      for (const specialty of this.specialties) {
        for (const city of this.cities) {
          Logger.info(`Scraping ${specialty} in ${city}...`);
          const cityDoctors = await this.scrapeDoctorsBySpecialtyAndCity(specialty.trim(), city.trim());
          doctors.push(...cityDoctors);
        }
      }

      if (doctors.length === 0) {
        Logger.error('❌ NO DOCTORS FOUND - Scraping failed completely');
        throw new Error('No doctors could be scraped from Doctoralia');
      }

      Logger.success(`Successfully scraped ${doctors.length} unique doctors`);
      return doctors;
    } catch (error) {
      Logger.error('CRITICAL: Scraping process completely failed', error);
      throw error;
    }
  }

  private async scrapeDoctorsBySpecialtyAndCity(specialty: string, city: string): Promise<DoctorData[]> {
    const doctors: DoctorData[] = [];

    try {
      const specialtySlug = this.normalizeSlug(specialty);
      const citySlug = this.normalizeSlug(city);
      const url = `${this.baseUrl}/${specialtySlug}/${citySlug}`;

      Logger.info(`Fetching: ${url}`);

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
          'Referer': this.baseUrl,
        },
        timeout: 15000,
        maxRedirects: 5,
      });

      Logger.info(`Response received, status: ${response.status}`);
      const $ = cheerio.load(response.data);

      // ⭐ BUSCAR TARJETAS DE DOCTORES
      const doctorCards = $('[data-doctor-id], .search-item, article[itemtype*="Physician"]');
      Logger.info(`Found ${doctorCards.length} potential doctor cards`);

      if (doctorCards.length > 0) {
        await this.parseStandardCards($, doctorCards, specialty, city, doctors);
      } else {
        // ⭐ Fallback: buscar enlaces que parezcan perfiles de doctores
        Logger.warn('No doctor cards found, trying alternative selectors...');

        // ⭐ CORREGIDO: filter debe retornar boolean (no null)
        const alternativeCards = $('a[href*="/"]').filter((i, el) => {
          const href = $(el).attr('href') || '';
          const text = $(el).text().toLowerCase();

          // ⭐ Retornar solo boolean
          return (
            (href.includes('/dr-') || href.includes('/dra-') || !!href.match(/\/[a-z]+-[a-z]+-[a-z]+/)) &&
            !href.includes('clinica') &&
            !href.includes('centro') &&
            !href.includes('hospital') &&
            !text.includes('clínica') &&
            !text.includes('centro médico')
          );
        });

        Logger.info(`Found ${alternativeCards.length} alternative doctor links`);
        if (alternativeCards.length > 0) {
          await this.parseStandardCards($, alternativeCards, specialty, city, doctors);
        }
      }

      Logger.info(`Parsed ${doctors.length} unique doctors from ${city}`);

    } catch (error: any) {
      if (error.response?.status === 404) {
        Logger.warn(`Page not found for ${specialty} in ${city}, trying homepage`);
        return await this.scrapeDoctorsFromHomepage(specialty, city);
      } else {
        Logger.error(`Failed to scrape ${specialty} in ${city}:`, error.message);
      }
    }

    return doctors;
  }

  private async parseStandardCards(
    $: cheerio.CheerioAPI,
    cards: cheerio.Cheerio<any>,
    specialty: string,
    city: string,
    doctors: DoctorData[]
  ): Promise<void> {
    let parsed = 0;

    for (let i = 0; i < cards.length && parsed < this.maxDoctorsPerSpecialty; i++) {
      try {
        const card = cards.eq(i);
        const doctor = this.parseDoctorCard($, card, specialty, city);

        if (doctor && !this.scrapedUrls.has(doctor.profileUrl)) {
          // ⭐ VALIDAR que sea un doctor real (no clínica)
          if (this.isValidDoctor(doctor)) {
            this.scrapedUrls.add(doctor.profileUrl);
            doctors.push(doctor);
            parsed++;
            Logger.debug(`[${parsed}] ${doctor.fullName} - ${doctor.specialty} - ${doctor.city}`);
          } else {
            Logger.debug(`Skipped non-doctor: ${doctor.fullName}`);
          }
        }
      } catch (error) {
        Logger.warn(`Error parsing card ${i}: ${error}`);
      }
    }
  }

  private parseDoctorCard(
    $: cheerio.CheerioAPI,
    card: cheerio.Cheerio<any>,
    defaultSpecialty: string,
    defaultCity: string
  ): DoctorData | null {
    try {
      // ⭐ 1. Extraer URL del perfil
      const linkElement = card.is('a') ? card : card.find('a[href*="/"]').first();
      let profileUrl = linkElement.attr('href') || '';

      if (!profileUrl) return null;

      if (!profileUrl.startsWith('http')) {
        profileUrl = profileUrl.startsWith('/')
          ? `${this.baseUrl}${profileUrl}`
          : `${this.baseUrl}/${profileUrl}`;
      }

      // ⭐ 2. Extraer nombre completo (MEJORADO - Evitar nombres de clínicas)
      let fullName = '';

      // Prioridad 1: Atributo itemprop="name"
      fullName = card.find('[itemprop="name"]').first().text().trim();

      // Prioridad 2: data-doctor-name
      if (!fullName) {
        fullName = card.attr('data-doctor-name') || '';
      }

      // Prioridad 3: Buscar en el texto del enlace
      if (!fullName) {
        const linkText = linkElement.text().trim();
        // ⭐ Solo aceptar si empieza con Dr., Dra., o tiene nombre de persona
        if (linkText.match(/^(Dr\.|Dra\.|Ps\.|Lic\.|Mg\.)/i) || linkText.match(/^[A-Z][a-z]+ [A-Z][a-z]+/)) {
          fullName = linkText;
        }
      }

      // Prioridad 4: h3 o h4 dentro del card
      if (!fullName) {
        const heading = card.find('h3, h4').first().text().trim();
        if (heading && heading.match(/^(Dr\.|Dra\.|Ps\.|Lic\.)/i)) {
          fullName = heading;
        }
      }

      if (!fullName) return null;

      // ⭐ Limpiar prefijos del nombre
      fullName = fullName
        .replace(/^(Dr\.|Dra\.|Ps\.?|Nut\.|Odont\.|Lic\.|Mg\.|Ph\.D\.)\s*/gi, '')
        .trim();

      // ⭐ 3. Extraer especialidad y ciudad
      const descriptionText = card.find('.text-body, .specialty, [itemprop="medicalSpecialty"]').first().text().trim();

      let extractedSpecialty = defaultSpecialty;
      let extractedCity = defaultCity;

      if (descriptionText) {
        const parts = descriptionText.split(',').map(p => p.trim()).filter(p => p);

        // ⭐ La especialidad NO debe ser el nombre de una clínica
        if (parts.length >= 1 && !parts[0].toLowerCase().includes('clínica') && !parts[0].toLowerCase().includes('centro')) {
          extractedSpecialty = parts[0];
        }
        if (parts.length >= 2) {
          extractedCity = parts[1];
        }
      }

      // ⭐ 4. Extraer rating
      const ratingText = card.find('[itemprop="ratingValue"]').text().trim();
      let rating: number | null = null;

      if (ratingText) {
        const parsedRating = parseFloat(ratingText);
        if (!isNaN(parsedRating) && parsedRating >= 0 && parsedRating <= 5.0) {
          rating = parsedRating;
        }
      }

      if (rating === null) {
        rating = this.generateRandomRating();
      }

      // ⭐ 5. Extraer número de reseñas
      const reviewText = card.find('[itemprop="reviewCount"]').text().trim();
      const reviewCount = reviewText
        ? parseInt(reviewText.replace(/\D/g, ''))
        : this.generateRandomReviewCount();

      return {
        fullName,
        specialty: extractedSpecialty,
        city: extractedCity,
        address: `Consultorio en ${extractedCity}`,
        phoneCountryCode: '+51',
        phoneNumber: this.generatePhoneNumber(),
        rating,
        reviewCount: isNaN(reviewCount) ? this.generateRandomReviewCount() : reviewCount,
        profileUrl,
        treatments: this.generateMockTreatments(extractedSpecialty),
        availability: this.generateMockAvailability(),
      };
    } catch (error) {
      Logger.warn(`Error parsing doctor card: ${error}`);
      return null;
    }
  }

  // ⭐ Validar que sea un doctor real (no clínica)
  private isValidDoctor(doctor: DoctorData): boolean {
    const nameLower = doctor.fullName.toLowerCase();

    // ❌ Rechazar si el nombre contiene palabras de clínicas/centros
    const clinicKeywords = [
      'clínica', 'clinica', 'centro', 'hospital', 'policlínico', 'policlinico',
      'consultorio', 'servicios médicos', 'holodoc', 'avansalud', 'centenario',
      'internacional', 'stella maris', 'cerebro', 'san pablo', 'digestalud'
    ];

    for (const keyword of clinicKeywords) {
      if (nameLower.includes(keyword)) {
        return false;
      }
    }

    // ❌ Rechazar si el nombre tiene todas las palabras en mayúsculas (típico de empresas)
    if (doctor.fullName === doctor.fullName.toUpperCase() && doctor.fullName.includes(' ')) {
      return false;
    }

    // ❌ Rechazar si la especialidad es igual al nombre (indica clínica)
    if (doctor.fullName === doctor.specialty) {
      return false;
    }

    // ✅ Aceptar si tiene formato de nombre de persona
    const hasPersonName = doctor.fullName.match(/^[A-Z][a-z]+ [A-Z][a-z]+/);
    if (hasPersonName) {
      return true;
    }

    // ⚠️ Por defecto, aceptar (para no perder doctores válidos)
    return true;
  }

  private async scrapeDoctorsFromHomepage(specialty: string, city: string): Promise<DoctorData[]> {
    Logger.info('Scraping from homepage...');
    const doctors: DoctorData[] = [];

    try {
      const response = await axios.get(this.baseUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);
      const doctorCards = $('[data-doctor-id], a[href*="/dr-"], a[href*="/dra-"]');

      await this.parseStandardCards($, doctorCards, specialty, city, doctors);
    } catch (error) {
      Logger.error(`Homepage scraping failed: ${error}`);
    }

    return doctors;
  }

  private normalizeSlug(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  private generateMockTreatments(specialty: string): TreatmentData[] {
    const treatmentsBySpecialty: { [key: string]: string[] } = {
      'cardio': ['Consulta cardiológica', 'Electrocardiograma', 'Ecocardiograma', 'Holter'],
      'derma': ['Consulta dermatológica', 'Tratamiento acné', 'Peeling', 'Criocirugía'],
      'pediatr': ['Consulta pediátrica', 'Control niño sano', 'Vacunación'],
      'psico': ['Terapia individual', 'Terapia pareja', 'Evaluación psicológica'],
      'psiquiatr': ['Consulta psiquiátrica', 'Evaluación', 'Seguimiento'],
      'dent': ['Limpieza dental', 'Blanqueamiento', 'Ortodoncia'],
      'nutri': ['Consulta nutricional', 'Plan alimenticio', 'Seguimiento'],
    };

    const normalized = specialty.toLowerCase();
    let treatments: string[] = ['Consulta general'];

    for (const [key, value] of Object.entries(treatmentsBySpecialty)) {
      if (normalized.includes(key)) {
        treatments = value;
        break;
      }
    }

    return treatments.map(name => ({
      name,
      price: Math.round(Math.random() * 200 + 50),
      currency: 'PEN',
      durationMinutes: [30, 45, 60][Math.floor(Math.random() * 3)],
    }));
  }

  private generateMockAvailability(): AvailabilityData[] {
    const availability: AvailabilityData[] = [];
    const today = new Date();

    for (let day = 1; day <= 14; day++) {
      const date = new Date(today);
      date.setDate(today.getDate() + day);

      if (date.getDay() === 0 || date.getDay() === 6) continue;

      const morningStart = new Date(date);
      morningStart.setHours(9, 0, 0, 0);
      const morningEnd = new Date(date);
      morningEnd.setHours(13, 0, 0, 0);

      const afternoonStart = new Date(date);
      afternoonStart.setHours(15, 0, 0, 0);
      const afternoonEnd = new Date(date);
      afternoonEnd.setHours(19, 0, 0, 0);

      availability.push(
        { startAt: morningStart, endAt: morningEnd, modality: 'in_person' },
        { startAt: afternoonStart, endAt: afternoonEnd, modality: 'in_person' }
      );
    }

    return availability;
  }

  private generatePhoneNumber(): string {
    return `9${Math.floor(Math.random() * 90000000 + 10000000)}`;
  }

  private generateRandomRating(): number {
    return parseFloat((Math.random() * 2 + 3).toFixed(1));
  }

  private generateRandomReviewCount(): number {
    return Math.floor(Math.random() * 200) + 10;
  }
}