import axios from 'axios';
import * as cheerio from 'cheerio';
import { Logger } from '../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

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

interface DoctorSearchResult {
    doctorId: string;
    doctorName: string;
    doctorUrl: string;
    addressId: string;
    specialty: string;
    city: string;
    rating: number | null;
    reviewCount: number;
}

export class DoctoraliaScraper {
    private baseUrl: string;
    private cities: string[];
    private maxDoctorsPerCity: number;
    private maxPages: number;
    private scrapedUrls: Set<string> = new Set();
    private useRealAvailability: boolean;
    private dataDir: string;

    constructor() {
        this.baseUrl = process.env.DOCTORALIA_BASE_URL || 'https://www.doctoralia.pe';
        this.cities = (process.env.TARGET_CITIES || 'Lima').split(',');
        this.maxDoctorsPerCity = parseInt(process.env.MAX_DOCTORS_PER_SPECIALTY || '45');
        this.maxPages = 3;
        this.useRealAvailability = process.env.USE_REAL_AVAILABILITY === 'true';
        this.dataDir = '/app/data';
    }

    async scrapeDoctors(): Promise<DoctorData[]> {
        Logger.info('Starting doctor scraping...');
        const allDoctors: DoctorData[] = [];

        try {
            for (const city of this.cities) {
                Logger.info(`Scraping ${city}...`);
                const cityDoctors = await this.scrapeDoctorsByCity(city.trim());
                allDoctors.push(...cityDoctors);
            }

            if (allDoctors.length === 0) {
                throw new Error('No doctors found');
            }

            Logger.success(`Scraped ${allDoctors.length} doctors`);
            await this.saveJsonFiles(allDoctors);

            return allDoctors;
        } catch (error) {
            Logger.error('Scraping failed', error);
            throw error;
        }
    }

    private async scrapeDoctorsByCity(city: string): Promise<DoctorData[]> {
        const doctors: DoctorData[] = [];
        const searchResults: DoctorSearchResult[] = [];

        for (let page = 1; page <= this.maxPages; page++) {
            const url = `${this.baseUrl}/buscar?q=&loc=${encodeURIComponent(city)}&page=${page}`;
            Logger.info(`Page ${page}: ${url}`);

            try {
                const response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'text/html',
                        'Accept-Language': 'es-PE,es',
                    },
                    timeout: 15000,
                });

                const $ = cheerio.load(response.data);
                const pageResults = this.parseSearchResults($, city);

                if (pageResults.length === 0) {
                    Logger.info('No more results, stopping');
                    break;
                }

                Logger.info(`Found ${pageResults.length} doctors`);
                searchResults.push(...pageResults);
                await this.sleep(500);
            } catch (error: any) {
                Logger.warn(`Page ${page} failed: ${error.message}`);
            }
        }

        let processed = 0;
        for (const result of searchResults) {
            if (processed >= this.maxDoctorsPerCity) break;
            if (this.scrapedUrls.has(result.doctorUrl)) continue;

            try {
                const doctor = await this.scrapeDoctorProfile(result);

                if (doctor && this.isValidDoctor(doctor)) {
                    this.scrapedUrls.add(result.doctorUrl);
                    doctors.push(doctor);
                    processed++;
                    Logger.debug(`[${processed}] ${doctor.fullName}`);
                    await this.sleep(400);
                }
            } catch (error) {
                Logger.warn(`Failed to scrape ${result.doctorName}`);
            }
        }

        return doctors;
    }

    private parseSearchResults($: cheerio.CheerioAPI, city: string): DoctorSearchResult[] {
        const results: DoctorSearchResult[] = [];

        $('[data-id="result-item"]').each((_, el) => {
            const card = $(el);
            const doctorId = card.attr('data-result-id') || '';
            const doctorName = card.attr('data-doctor-name') || '';
            const doctorUrl = card.attr('data-doctor-url') || '';
            const addressId = card.attr('data-address-id') || '';
            const specialty = card.attr('data-eec-specialization-name') || '';
            const ratingStr = card.attr('data-eec-stars-rating') || '';
            const reviewStr = card.attr('data-eec-opinions-count') || '';

            const rating = ratingStr ? parseFloat(ratingStr) : null;
            const reviewCount = reviewStr ? parseInt(reviewStr) : 0;

            if (doctorId && doctorName && doctorUrl) {
                results.push({
                    doctorId,
                    doctorName,
                    doctorUrl,
                    addressId,
                    specialty,
                    city,
                    rating: (rating && rating >= 0 && rating <= 5) ? rating : null,
                    reviewCount: isNaN(reviewCount) ? 0 : reviewCount,
                });
            }
        });

        return results;
    }

    private async scrapeDoctorProfile(result: DoctorSearchResult): Promise<DoctorData | null> {
        try {
            const response = await axios.get(result.doctorUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html',
                    'Referer': this.baseUrl,
                },
                timeout: 15000,
            });

            const $ = cheerio.load(response.data);

            const fullName = result.doctorName
                .replace(/^(Dr\.|Dra\.|Ps\.?|Odont\.|Lic\.|Mg\.)\s*/gi, '')
                .trim();

            const address = this.extractAddress($) || `Consultorio en ${result.city}`;
            const phoneNumber = this.extractPhone($);
            const treatments = this.extractTreatments($);
            const finalTreatments = treatments.length > 0
                ? treatments
                : this.generateMockTreatments(result.specialty);

            const isOnline = address.toLowerCase().includes('online');

            let availability: AvailabilityData[];
            if (this.useRealAvailability && result.addressId) {
                availability = await this.fetchAvailability(result.doctorId, result.addressId);
                if (availability.length === 0) {
                    availability = this.generateMockAvailability(isOnline);
                }
            } else {
                availability = this.generateMockAvailability(isOnline);
            }

            return {
                fullName,
                specialty: result.specialty,
                city: result.city,
                address,
                phoneCountryCode: '+51',
                phoneNumber,
                rating: result.rating,
                reviewCount: result.reviewCount,
                profileUrl: result.doctorUrl,
                treatments: finalTreatments,
                availability,
            };
        } catch (error: any) {
            Logger.warn(`Error: ${error.message}`);
            return null;
        }
    }

    private cleanAddress(addr: string): string {
        return addr
            .replace(/\s+/g, ' ')
            .replace(/\n/g, '')
            .replace(/\t/g, '')
            .replace(/,\s*,/g, ',')
            .replace(/^\s*,\s*/, '')
            .replace(/\s*,\s*$/, '')
            .replace(/\s+,/g, ',')
            .replace(/,\s+/g, ', ')
            .trim();
    }

    private extractAddress($: cheerio.CheerioAPI): string | null {
        try {
            let addr = '';

            $('[itemprop="address"]').each((_, el) => {
                const addressBlock = $(el);
                const streetSpan = addressBlock.find('span.text-truncate').first().text().trim();

                if (streetSpan && streetSpan.length > 10) {
                    const cleaned = this.cleanAddress(streetSpan.split(/\s+\d{5}$/)[0]);

                    if (cleaned && !cleaned.includes('Núm. Colegiado')) {
                        addr = cleaned;
                        return false;
                    }
                }
            });

            if (addr) {
                Logger.debug(`Found address (method 1): ${addr}`);
                return addr;
            }

            const addressElement = $('[data-__test__-id="street-address"]');
            if (addressElement.length > 0) {
                const text = addressElement.parent().find('span.text-truncate').first().text().trim();
                if (text && text.length > 10) {
                    addr = this.cleanAddress(text.split(/\s+\d{5}$/)[0]);
                    Logger.debug(`Found address (method 2): ${addr}`);
                    return addr;
                }
            }

            const metaStreet = $('meta[itemprop="streetAddress"]').attr('content');
            if (metaStreet && metaStreet.length > 5) {
                addr = this.cleanAddress(metaStreet);
                Logger.debug(`Found address (method 3): ${addr}`);
                return addr;
            }

            $('div.overflow-hidden, div.d-flex').each((_, el) => {
                const container = $(el);

                container.find('span').each((_, span) => {
                    const text = $(span).text().trim();

                    if (text.length > 15 &&
                        text.match(/\d/) &&
                        (text.toLowerCase().includes('calle') ||
                            text.toLowerCase().includes('av.') ||
                            text.toLowerCase().includes('avenida') ||
                            text.toLowerCase().includes('jr') ||
                            text.toLowerCase().includes('urb') ||
                            text.toLowerCase().includes('psicoterapia online'))) {

                        if (!text.match(/^(Dr\.|Dra\.|Ps\s)/i) &&
                            !text.includes('Clínica') &&
                            !text.includes('Centro') &&
                            !text.includes('Hospital')) {

                            addr = this.cleanAddress(text.split(/\s+\d{5}$/)[0]);
                            return false;
                        }
                    }
                });

                if (addr) return false;
            });

            if (addr) {
                Logger.debug(`Found address (method 4): ${addr}`);
                return addr;
            }

            $('p.m-0').each((_, el) => {
                const text = $(el).find('span.text-truncate').first().text().trim();

                if (text && text.length > 15 && text.match(/\d/)) {
                    const hasAddressKeywords =
                        text.toLowerCase().includes('calle') ||
                        text.toLowerCase().includes('av.') ||
                        text.toLowerCase().includes('urb.') ||
                        text.toLowerCase().includes('jr') ||
                        text.toLowerCase().includes('psicoterapia online');

                    if (hasAddressKeywords && !text.match(/^(Dr\.|Dra\.|Ps\s)/i)) {
                        addr = this.cleanAddress(text.split(/\s+\d{5}$/)[0]);
                        return false;
                    }
                }
            });

            if (addr) {
                Logger.debug(`Found address (method 5): ${addr}`);
                return addr;
            }

            Logger.warn('No address found with any method');
            return null;

        } catch (error) {
            Logger.debug(`Error extracting address: ${error}`);
            return null;
        }
    }

    private extractPhone($: cheerio.CheerioAPI): string {
        try {
            const phoneMeta = $('meta[itemprop="telephone"]').attr('content');
            if (phoneMeta) {
                return phoneMeta.replace(/\+51\s*/, '').replace(/\s/g, '');
            }

            const phoneRegex = /(\+51\s?)?9\d{8}/;
            const match = $('body').text().match(phoneRegex);

            if (match) {
                return match[0].replace(/\s/g, '').replace('+51', '');
            }

            return this.generatePhone();
        } catch {
            return this.generatePhone();
        }
    }

    private extractTreatments($: cheerio.CheerioAPI): TreatmentData[] {
        const treatments: TreatmentData[] = [];
        const seen = new Set<string>();

        try {
            $('li[data-id="service-item"]').each((_, el) => {
                const name = $(el).find('h3[itemprop="availableService"]').text().trim();
                if (!name) return;

                const nameLower = name.toLowerCase();
                if (seen.has(nameLower)) return;
                seen.add(nameLower);

                const priceText = $(el).find('.mr-1').text().trim();
                const priceMatch = priceText.match(/S\/\s*(\d+)/);

                treatments.push({
                    name,
                    price: priceMatch ? parseInt(priceMatch[1]) : undefined,
                    currency: priceMatch ? 'PEN' : undefined,
                    durationMinutes: 30,
                });
            });

            if (treatments.length === 0) {
                $('h3.h5.font-weight-bold').each((_, el) => {
                    const name = $(el).text().trim();
                    if (!name) return;

                    const nameLower = name.toLowerCase();
                    if (seen.has(nameLower)) return;
                    seen.add(nameLower);

                    const priceText = $(el).parent().find('.mr-1').text().trim();
                    const priceMatch = priceText.match(/S\/\s*(\d+)/);

                    treatments.push({
                        name,
                        price: priceMatch ? parseInt(priceMatch[1]) : undefined,
                        currency: priceMatch ? 'PEN' : undefined,
                        durationMinutes: 30,
                    });
                });
            }
        } catch {
            // Por ahora ignorar erroress
        }

        return treatments;
    }

    private async fetchAvailability(doctorId: string, addressId: string): Promise<AvailabilityData[]> {
        try {
            const today = new Date();
            const end = new Date(today);
            end.setDate(today.getDate() + 14);

            const start = today.toISOString().split('T')[0] + 'T00:00:00-05:00';
            const endStr = end.toISOString().split('T')[0] + 'T00:00:00-05:00';

            const url = `${this.baseUrl}/api/v3/doctors/${doctorId}/addresses/${addressId}/slots`;
            const params = new URLSearchParams({ start, end: endStr, includingSaasOnlyCalendar: 'false' });

            const response = await axios.get(`${url}?${params}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json',
                },
                timeout: 10000,
            });

            const slots = response.data._items || [];
            const availability: AvailabilityData[] = [];

            for (const slot of slots) {
                if (!slot.booked && slot.booking_url) {
                    const startAt = new Date(slot.start);
                    const endAt = new Date(startAt);
                    endAt.setHours(startAt.getHours() + 1);

                    availability.push({
                        startAt,
                        endAt,
                        modality: 'in_person',
                    });
                }
            }

            return availability;
        } catch {
            return [];
        }
    }

    private async saveJsonFiles(doctors: DoctorData[]): Promise<void> {
        try {
            await fs.mkdir(this.dataDir, { recursive: true });

            await fs.writeFile(
                path.join(this.dataDir, 'doctors.json'),
                JSON.stringify(doctors, null, 2)
            );

            const treatments = doctors.flatMap((doc, idx) =>
                doc.treatments.map(t => ({ doctorIndex: idx, ...t }))
            );
            await fs.writeFile(
                path.join(this.dataDir, 'treatments.json'),
                JSON.stringify(treatments, null, 2)
            );

            const availability = doctors.flatMap((doc, idx) =>
                doc.availability.map(a => ({ doctorIndex: idx, ...a }))
            );
            await fs.writeFile(
                path.join(this.dataDir, 'availability.json'),
                JSON.stringify(availability, null, 2)
            );

            Logger.success('JSON files saved');
        } catch (error) {
            Logger.warn('Could not save JSON files');
        }
    }

    private isValidDoctor(doctor: DoctorData): boolean {
        const name = doctor.fullName.toLowerCase();
        const blacklist = ['clínica', 'centro médico', 'hospital', 'policlínico', 'servicios médicos'];

        for (const word of blacklist) {
            if (name.includes(word)) return false;
        }

        if (doctor.fullName === doctor.fullName.toUpperCase() && doctor.fullName.includes(' ')) {
            return false;
        }

        return doctor.fullName.trim().split(' ').length >= 2;
    }

    private generateMockTreatments(specialty: string): TreatmentData[] {
        const mapping: { [key: string]: string[] } = {
            'cardio': ['Consulta cardiológica', 'Electrocardiograma', 'Ecocardiograma'],
            'derma': ['Consulta dermatológica', 'Tratamiento acné', 'Peeling'],
            'pediatr': ['Consulta pediátrica', 'Control niño sano', 'Vacunación'],
            'psico': ['Terapia individual', 'Terapia pareja', 'Evaluación psicológica'],
            'psiquiatr': ['Consulta psiquiátrica', 'Evaluación', 'Seguimiento'],
            'dent': ['Limpieza dental', 'Blanqueamiento', 'Ortodoncia'],
            'nutri': ['Consulta nutricional', 'Plan alimenticio'],
        };

        const normalized = specialty.toLowerCase();
        let names = ['Consulta general'];

        for (const [key, value] of Object.entries(mapping)) {
            if (normalized.includes(key)) {
                names = value;
                break;
            }
        }

        return names.map(name => ({
            name,
            price: Math.round(Math.random() * 200 + 50),
            currency: 'PEN',
            durationMinutes: [30, 45, 60][Math.floor(Math.random() * 3)],
        }));
    }

    private generateMockAvailability(isOnline: boolean = false): AvailabilityData[] {
        const slots: AvailabilityData[] = [];
        const today = new Date();

        for (let day = 1; day <= 14; day++) {
            const date = new Date(today);
            date.setDate(today.getDate() + day);

            if (date.getDay() === 0 || date.getDay() === 6) continue;

            const morning = new Date(date);
            morning.setHours(9, 0, 0, 0);
            const morningEnd = new Date(date);
            morningEnd.setHours(13, 0, 0, 0);

            const afternoon = new Date(date);
            afternoon.setHours(15, 0, 0, 0);
            const afternoonEnd = new Date(date);
            afternoonEnd.setHours(19, 0, 0, 0);

            const modality = isOnline ? 'online' : 'in_person';

            slots.push(
                { startAt: morning, endAt: morningEnd, modality },
                { startAt: afternoon, endAt: afternoonEnd, modality }
            );
        }

        return slots;
    }

    private generatePhone(): string {
        return `9${Math.floor(Math.random() * 90000000 + 10000000)}`;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}