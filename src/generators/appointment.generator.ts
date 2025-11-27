import { Logger } from '../utils/logger';
import { AvailabilityData } from '../scrapers/doctoralia.scraper';

export interface AppointmentData {
  doctorId: bigint;
  patientId: bigint;
  treatmentId: bigint;
  startAt: Date;
  endAt: Date;
  status: 'scheduled' | 'completed' | 'cancelled';
}

export class AppointmentGenerator {
  private numAppointmentsPerDoctor: number;

  constructor() {
    this.numAppointmentsPerDoctor = parseInt(process.env.NUM_APPOINTMENTS_PER_DOCTOR || '10');
  }

  generate(
    doctors: Array<{ id: bigint; availability: any[]; treatments: Array<{ id: bigint }> }>,
    patients: Array<{ id: bigint }>
  ): AppointmentData[] {
    Logger.info('Generating appointments...');
    const appointments: AppointmentData[] = [];

    for (const doctor of doctors) {
      // Validar que el doctor tenga disponibilidad Y tratamientos
      if (!doctor.availability || doctor.availability.length === 0) {
        Logger.warn(`Doctor ${doctor.id} has no availability slots`);
        continue;
      }

      if (!doctor.treatments || doctor.treatments.length === 0) {
        Logger.warn(`Doctor ${doctor.id} has no treatments`);
        continue;
      }

      const numAppointments = Math.min(
        this.numAppointmentsPerDoctor,
        doctor.availability.length * 4 // Máximo 4 citas por bloque de disponibilidad
      );

      for (let i = 0; i < numAppointments; i++) {
        try {
          const appointment = this.generateAppointment(doctor, patients);
          if (appointment) {
            appointments.push(appointment);
          }
        } catch (error) {
          Logger.debug(`Could not generate appointment ${i + 1} for doctor ${doctor.id}: ${error}`);
        }
      }
    }

    Logger.success(`Generated ${appointments.length} appointments`);
    return appointments;
  }

  private generateAppointment(
    doctor: { id: bigint; availability: any[]; treatments: Array<{ id: bigint }> },
    patients: Array<{ id: bigint }>
  ): AppointmentData | null {
    // Seleccionar disponibilidad aleatoria
    const availability = doctor.availability[Math.floor(Math.random() * doctor.availability.length)];

    // Seleccionar tratamiento aleatorio
    const treatment = doctor.treatments[Math.floor(Math.random() * doctor.treatments.length)];

    // Seleccionar paciente aleatorio
    const patient = patients[Math.floor(Math.random() * patients.length)];

    // Convertir a Date si no lo son
    const startDate = availability.start_at instanceof Date ? availability.start_at : new Date(availability.start_at);
    const endDate = availability.end_at instanceof Date ? availability.end_at : new Date(availability.end_at);

    // Generar hora de inicio dentro del bloque de disponibilidad
    const availabilityDuration = endDate.getTime() - startDate.getTime();
    const slotDuration = 30 * 60 * 1000; // 30 minutos por defecto

    const maxSlots = Math.floor(availabilityDuration / slotDuration);
    if (maxSlots <= 0) return null;

    const randomSlot = Math.floor(Math.random() * maxSlots);
    const startAt = new Date(startDate.getTime() + randomSlot * slotDuration);
    const endAt = new Date(startAt.getTime() + slotDuration);

    // Validar que endAt no exceda availability.endAt
    if (endAt > endDate) {
      return null;
    }

    // Estado aleatorio con probabilidades
    const rand = Math.random();
    let status: 'scheduled' | 'completed' | 'cancelled';
    if (rand < 0.7) status = 'scheduled';
    else if (rand < 0.9) status = 'completed';
    else status = 'cancelled';

    return {
      doctorId: doctor.id,
      patientId: patient.id,
      treatmentId: treatment.id,
      startAt,
      endAt,
      status,
    };
  }
}