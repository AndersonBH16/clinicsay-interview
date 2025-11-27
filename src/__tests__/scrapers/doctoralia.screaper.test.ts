import { DoctoraliaScraper } from '../../scrapers/doctoralia.scraper';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DoctoraliaScraper', () => {
  let scraper: DoctoraliaScraper;

  beforeEach(() => {
    scraper = new DoctoraliaScraper();
  });

  describe('cleanAddress', () => {
    it('should clean address with multiple spaces', () => {
      const dirtyAddress = 'Calle   el   Palmar   181';
      const cleaned = (scraper as any).cleanAddress(dirtyAddress);
      expect(cleaned).toBe('Calle el Palmar 181');
    });

    it('should remove line breaks and tabs', () => {
      const dirtyAddress = 'Calle\nel\tPalmar\n181';
      const cleaned = (scraper as any).cleanAddress(dirtyAddress);
      expect(cleaned).toBe('Calle el Palmar 181');
    });

    it('should normalize commas', () => {
      const dirtyAddress = 'Urb Pando  ,  ,  Lima';
      const cleaned = (scraper as any).cleanAddress(dirtyAddress);
      expect(cleaned).toBe('Urb Pando, Lima');
    });

    it('should remove leading and trailing commas', () => {
      const dirtyAddress = ', Calle 123 ,';
      const cleaned = (scraper as any).cleanAddress(dirtyAddress);
      expect(cleaned).toBe('Calle 123');
    });
  });

  describe('isValidDoctor', () => {
    it('should reject clinics', () => {
      const doctor = {
        fullName: 'Clínica San Pablo',
        specialty: 'General',
        city: 'Lima',
        address: 'Av. Test',
        phoneCountryCode: '+51',
        phoneNumber: '912345678',
        rating: 4.5,
        reviewCount: 100,
        profileUrl: 'https://test.com',
        treatments: [],
        availability: [],
      };

      const isValid = (scraper as any).isValidDoctor(doctor);
      expect(isValid).toBe(false);
    });

    it('should accept valid doctors', () => {
      const doctor = {
        fullName: 'Juan Pérez García',
        specialty: 'Cardiólogo',
        city: 'Lima',
        address: 'Av. Test',
        phoneCountryCode: '+51',
        phoneNumber: '912345678',
        rating: 4.5,
        reviewCount: 100,
        profileUrl: 'https://test.com',
        treatments: [],
        availability: [],
      };

      const isValid = (scraper as any).isValidDoctor(doctor);
      expect(isValid).toBe(true);
    });

    it('should reject names with all uppercase', () => {
      const doctor = {
        fullName: 'CENTRO MEDICO INTERNACIONAL',
        specialty: 'General',
        city: 'Lima',
        address: 'Av. Test',
        phoneCountryCode: '+51',
        phoneNumber: '912345678',
        rating: 4.5,
        reviewCount: 100,
        profileUrl: 'https://test.com',
        treatments: [],
        availability: [],
      };

      const isValid = (scraper as any).isValidDoctor(doctor);
      expect(isValid).toBe(false);
    });
  });

  describe('generatePhone', () => {
    it('should generate a valid Peruvian phone number', () => {
      const phone = (scraper as any).generatePhone();
      expect(phone).toMatch(/^9\d{8}$/);
    });
  });
});