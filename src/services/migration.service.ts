import { PrismaClient } from '@prisma/client';
import { Logger } from '../utils/logger';
import { ErrorTracker } from '../utils/error-tracker';
import { DoctorData } from '../scrapers/doctoralia.scraper';
import { PatientData } from '../generators/patient.generator';
import { AppointmentData } from '../generators/appointment.generator';

export class MigrationService {
  constructor(private prisma: PrismaClient) {}

  async insertDoctors(doctors: DoctorData[]): Promise<Array<{ id: bigint; availability: any[]; treatments: any[] }>> {
    Logger.info('Inserting doctors into database...');
    const insertedDoctors: Array<{ id: bigint; availability: any[]; treatments: any[] }> = [];

    for (const doctor of doctors) {
      try {
        // ⭐ CORREGIDO: Manejar null correctamente
        let validRating: number | null = doctor.rating;

        if (validRating !== null && (isNaN(validRating) || validRating > 5.0 || validRating < 0)) {
          validRating = null;
          Logger.warn(`Invalid rating for ${doctor.fullName} (${doctor.rating}), setting to NULL`);
        }

        const inserted = await this.prisma.doctors.create({
          data: {
            full_name: doctor.fullName,
            specialty: doctor.specialty,
            city: doctor.city,
            address: doctor.address,
            phone_country_code: doctor.phoneCountryCode,
            phone_number: doctor.phoneNumber,
            rating: validRating,
            review_count: doctor.reviewCount,
            source_profile_url: doctor.profileUrl,
          },
        });

        const treatments = await this.insertTreatments(inserted.id, doctor.treatments);
        const availability = await this.insertAvailability(inserted.id, doctor.availability);

        insertedDoctors.push({
          id: inserted.id,
          treatments,
          availability,
        });

        Logger.debug(`Inserted doctor: ${doctor.fullName} (rating: ${validRating ?? 'N/A'}, ${treatments.length} treatments, ${availability.length} slots)`);
      } catch (error: any) {
        Logger.error(`Error inserting doctor ${doctor.fullName}`, error);
        ErrorTracker.addError(
          'INSERT_DOCTORS',
          `Failed to insert doctor: ${doctor.fullName}`,
          error
        );
      }
    }

    Logger.success(`Inserted ${insertedDoctors.length} doctors`);
    return insertedDoctors;
  }

  private async insertTreatments(doctorId: bigint, treatments: any[]): Promise<Array<{ id: bigint }>> {
    const inserted = [];

    for (const treatment of treatments) {
      try {
        const result = await this.prisma.treatments.create({
          data: {
            doctor_id: doctorId,
            name: treatment.name,
            price: treatment.price,
            currency: treatment.currency,
            duration_minutes: treatment.durationMinutes,
          },
        });
        inserted.push({ id: result.id });
      } catch (error: any) {
        Logger.warn(`Error inserting treatment ${treatment.name} for doctor ${doctorId}`);
        ErrorTracker.addError(
          'INSERT_TREATMENTS',
          `Failed to insert treatment: ${treatment.name}`,
          error
        );
      }
    }

    return inserted;
  }

  private async insertAvailability(doctorId: bigint, availability: any[]): Promise<any[]> {
    const inserted = [];

    for (const slot of availability) {
      try {
        const result = await this.prisma.doctor_availability.create({
          data: {
            doctor_id: doctorId,
            start_at: slot.startAt,
            end_at: slot.endAt,
            modality: slot.modality,
          },
        });
        inserted.push(result);
      } catch (error: any) {
        Logger.warn(`Error inserting availability for doctor ${doctorId}:`, error);
        ErrorTracker.addError(
          'INSERT_AVAILABILITY',
          `Failed to insert availability for doctor ${doctorId}`,
          error
        );
      }
    }

    return inserted;
  }

  async insertPatients(patients: PatientData[]): Promise<Array<{ id: bigint }>> {
    Logger.info('Inserting patients into database...');
    const insertedPatients: Array<{ id: bigint }> = [];

    for (const patient of patients) {
      try {
        const inserted = await this.prisma.patients.create({
          data: {
            full_name: patient.fullName,
            document_number: patient.documentNumber,
            phone_number: patient.phoneNumber,
            email: patient.email,
          },
        });

        insertedPatients.push({ id: inserted.id });
      } catch (error: any) {
        Logger.error(`Error inserting patient ${patient.fullName}`, error);
        ErrorTracker.addError(
          'INSERT_PATIENTS',
          `Failed to insert patient: ${patient.fullName}`,
          error
        );
      }
    }

    Logger.success(`Inserted ${insertedPatients.length} patients`);
    return insertedPatients;
  }

  async insertAppointments(appointments: AppointmentData[]): Promise<void> {
    Logger.info('Inserting appointments into database...');
    let successCount = 0;

    for (const appointment of appointments) {
      try {
        await this.prisma.appointments.create({
          data: {
            doctor_id: appointment.doctorId,
            patient_id: appointment.patientId,
            treatment_id: appointment.treatmentId,
            start_at: appointment.startAt,
            end_at: appointment.endAt,
            status: appointment.status,
          },
        });

        successCount++;
      } catch (error: any) {
        Logger.warn(`Error inserting appointment: ${error}`);
        ErrorTracker.addError(
          'INSERT_APPOINTMENTS',
          'Failed to insert appointment',
          error
        );
      }
    }

    Logger.success(`Inserted ${successCount} appointments`);
  }

  async getStats(): Promise<void> {
    Logger.info('Getting database statistics...');

    const [doctors, treatments, availability, patients, appointments] = await Promise.all([
      this.prisma.doctors.count(),
      this.prisma.treatments.count(),
      this.prisma.doctor_availability.count(),
      this.prisma.patients.count(),
      this.prisma.appointments.count(),
    ]);

    Logger.info('='.repeat(50));
    Logger.info('DATABASE STATISTICS');
    Logger.info('='.repeat(50));
    Logger.info(`Doctors: ${doctors}`);
    Logger.info(`Treatments: ${treatments}`);
    Logger.info(`Availability slots: ${availability}`);
    Logger.info(`Patients: ${patients}`);
    Logger.info(`Appointments: ${appointments}`);
    Logger.info('='.repeat(50));
  }
}