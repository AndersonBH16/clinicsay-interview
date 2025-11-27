import { Logger } from '../utils/logger';

export interface PatientData {
  fullName: string;
  documentNumber: string;
  phoneNumber: string;
  email: string;
}

export class PatientGenerator {
  private numPatients: number;

  constructor() {
    this.numPatients = parseInt(process.env.NUM_PATIENTS || '100');
  }

  generate(): PatientData[] {
    Logger.info(`Generating ${this.numPatients} patients...`);
    const patients: PatientData[] = [];

    const firstNames = [
      'Juan', 'María', 'Carlos', 'Ana', 'Luis', 'Carmen', 'José', 'Rosa',
      'Miguel', 'Patricia', 'Pedro', 'Laura', 'Diego', 'Sofia', 'Fernando'
    ];

    const lastNames = [
      'García', 'Rodríguez', 'López', 'Martínez', 'Sánchez', 'Pérez',
      'Gómez', 'Fernández', 'Torres', 'Ramírez', 'Flores', 'Vega'
    ];

    for (let i = 0; i < this.numPatients; i++) {
      const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lastName1 = lastNames[Math.floor(Math.random() * lastNames.length)];
      const lastName2 = lastNames[Math.floor(Math.random() * lastNames.length)];

      patients.push({
        fullName: `${firstName} ${lastName1} ${lastName2}`,
        documentNumber: this.generateDNI(),
        phoneNumber: this.generatePhoneNumber(),
        email: this.generateEmail(firstName, lastName1),
      });
    }

    Logger.success(`Generated ${patients.length} patients`);
    return patients;
  }

  private generateDNI(): string {
    return `${Math.floor(Math.random() * 90000000 + 10000000)}`;
  }

  private generatePhoneNumber(): string {
    return `9${Math.floor(Math.random() * 90000000 + 10000000)}`;
  }

  private generateEmail(firstName: string, lastName: string): string {
    const domains = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com'];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    const randomNum = Math.floor(Math.random() * 999);
    return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomNum}@${domain}`;
  }
}