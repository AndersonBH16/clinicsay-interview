import { PatientGenerator } from '../../generators/patient.generator';

describe('PatientGenerator', () => {
  const originalNumPatients = process.env.NUM_PATIENTS;

  afterEach(() => {
    if (originalNumPatients) {
      process.env.NUM_PATIENTS = originalNumPatients;
    } else {
      delete process.env.NUM_PATIENTS;
    }
  });

  it('should generate the correct number of patients', () => {
    process.env.NUM_PATIENTS = '50';
    const generator = new PatientGenerator();
    const patients = generator.generate();
    expect(patients).toHaveLength(50);
  });

  it('should generate patients with valid data', () => {
    const generator = new PatientGenerator();
    const patients = generator.generate();
    const patient = patients[0];

    expect(patient.fullName).toBeDefined();
    expect(patient.fullName.length).toBeGreaterThan(0);
    expect(patient.documentNumber).toMatch(/^\d{8}$/);
    expect(patient.phoneNumber).toMatch(/^9\d{8}$/);
    expect(patient.email).toContain('@');
  });

  it('should generate unique document numbers', () => {
    const generator = new PatientGenerator();
    const patients = generator.generate();
    const documentNumbers = patients.map(p => p.documentNumber);
    const uniqueDocuments = new Set(documentNumbers);

    expect(uniqueDocuments.size).toBe(documentNumbers.length);
  });

  it('should generate unique emails', () => {
    const generator = new PatientGenerator();
    const patients = generator.generate();
    const emails = patients.map(p => p.email);
    const uniqueEmails = new Set(emails);

    expect(uniqueEmails.size).toBe(emails.length);
  });
});