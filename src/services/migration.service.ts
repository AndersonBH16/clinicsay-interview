import { PrismaClient } from '@prisma/client';
import { Logger } from '../utils/logger';
import { ErrorTracker } from '../utils/error-tracker';
import { DoctorData } from '../scrapers/doctoralia.scraper';
import { PatientData } from '../generators/patient.generator';
import { AppointmentData } from '../generators/appointment.generator';

export class MigrationService {
    constructor(private prisma: PrismaClient) {}

    async insertDoctors(doctors: DoctorData[]): Promise<Array<{ id: bigint; availability: any[]; treatments: any[] }>> {
        Logger.info('Inserting doctors...');
        const inserted: Array<{ id: bigint; availability: any[]; treatments: any[] }> = [];

        for (const doctor of doctors) {
            try {
                let rating = doctor.rating;

                if (rating !== null && (isNaN(rating) || rating > 5.0 || rating < 0)) {
                    rating = null;
                }

                const doc = await this.prisma.doctors.create({
                    data: {
                        full_name: doctor.fullName,
                        specialty: doctor.specialty,
                        city: doctor.city,
                        address: doctor.address,
                        phone_country_code: doctor.phoneCountryCode,
                        phone_number: doctor.phoneNumber,
                        rating,
                        review_count: doctor.reviewCount,
                        source_profile_url: doctor.profileUrl,
                    },
                });

                const treatments = await this.insertTreatments(doc.id, doctor.treatments);
                const availability = await this.insertAvailability(doc.id, doctor.availability);

                inserted.push({ id: doc.id, treatments, availability });

                Logger.debug(`${doctor.fullName}: ${treatments.length} treatments, ${availability.length} slots`);
            } catch (error: any) {
                Logger.error(`Failed: ${doctor.fullName}`, error);
                ErrorTracker.addError('INSERT_DOCTORS', `Failed: ${doctor.fullName}`, error);
            }
        }

        Logger.success(`Inserted ${inserted.length} doctors`);
        return inserted;
    }

    private async insertTreatments(doctorId: bigint, treatments: any[]): Promise<Array<{ id: bigint }>> {
        const inserted = [];
        const unique = treatments.reduce((acc, t) => {
            const exists = acc.find((x: any) => x.name.toLowerCase() === t.name.toLowerCase());
            if (!exists) acc.push(t);
            return acc;
        }, [] as any[]);

        for (const treatment of unique) {
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
                ErrorTracker.addError('INSERT_TREATMENTS', `Failed: ${treatment.name}`, error);
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
                ErrorTracker.addError('INSERT_AVAILABILITY', `Failed for doctor ${doctorId}`, error);
            }
        }

        return inserted;
    }

    async insertPatients(patients: PatientData[]): Promise<Array<{ id: bigint }>> {
        Logger.info('Inserting patients...');
        const inserted: Array<{ id: bigint }> = [];

        for (const patient of patients) {
            try {
                const p = await this.prisma.patients.create({
                    data: {
                        full_name: patient.fullName,
                        document_number: patient.documentNumber,
                        phone_number: patient.phoneNumber,
                        email: patient.email,
                    },
                });
                inserted.push({ id: p.id });
            } catch (error: any) {
                Logger.error(`Failed: ${patient.fullName}`, error);
                ErrorTracker.addError('INSERT_PATIENTS', `Failed: ${patient.fullName}`, error);
            }
        }

        Logger.success(`Inserted ${inserted.length} patients`);
        return inserted;
    }

    async insertAppointments(appointments: AppointmentData[]): Promise<void> {
        Logger.info('Inserting appointments...');
        let count = 0;

        for (const apt of appointments) {
            try {
                await this.prisma.appointments.create({
                    data: {
                        doctor_id: apt.doctorId,
                        patient_id: apt.patientId,
                        treatment_id: apt.treatmentId,
                        start_at: apt.startAt,
                        end_at: apt.endAt,
                        status: apt.status,
                    },
                });
                count++;
            } catch (error: any) {
                ErrorTracker.addError('INSERT_APPOINTMENTS', 'Failed', error);
            }
        }

        Logger.success(`Inserted ${count} appointments`);
    }

    async getStats(): Promise<void> {
        Logger.info('Database stats...');

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
        Logger.info(`Availability: ${availability}`);
        Logger.info(`Patients: ${patients}`);
        Logger.info(`Appointments: ${appointments}`);
        Logger.info('='.repeat(50));
    }
}