import { AppointmentGenerator } from '../../generators/appointment.generator';

describe('AppointmentGenerator', () => {
  let generator: AppointmentGenerator;

  beforeEach(() => {
    generator = new AppointmentGenerator();
  });

  it('should generate appointments for all doctors', () => {
    const mockDoctors = [
      {
        id: BigInt(1),
        treatments: [{ id: BigInt(1) }, { id: BigInt(2) }],
        availability: [
          {
            start_at: new Date('2025-12-01T09:00:00'),
            end_at: new Date('2025-12-01T13:00:00'),
            modality: 'in_person' as const,
          },
        ],
      },
      {
        id: BigInt(2),
        treatments: [{ id: BigInt(3) }],
        availability: [
          {
            start_at: new Date('2025-12-01T15:00:00'),
            end_at: new Date('2025-12-01T19:00:00'),
            modality: 'online' as const,
          },
        ],
      },
    ];

    const mockPatients = [
      { id: BigInt(1) },
      { id: BigInt(2) },
      { id: BigInt(3) },
    ];

    const appointments = generator.generate(mockDoctors, mockPatients);

    expect(appointments.length).toBeGreaterThan(0);
    expect(appointments.every(apt => apt.doctorId)).toBe(true);
    expect(appointments.every(apt => apt.patientId)).toBe(true);
    expect(appointments.every(apt => apt.treatmentId)).toBe(true);
  });

  it('should generate appointments within availability slots', () => {
    const mockDoctors = [
      {
        id: BigInt(1),
        treatments: [{ id: BigInt(1) }],
        availability: [
          {
            start_at: new Date('2025-12-01T09:00:00'),
            end_at: new Date('2025-12-01T10:00:00'),
            modality: 'in_person' as const,
          },
        ],
      },
    ];

    const mockPatients = [{ id: BigInt(1) }];

    const appointments = generator.generate(mockDoctors, mockPatients);

    appointments.forEach(apt => {
      expect(apt.startAt.getTime()).toBeGreaterThanOrEqual(
        new Date('2025-12-01T09:00:00').getTime()
      );
      expect(apt.endAt.getTime()).toBeLessThanOrEqual(
        new Date('2025-12-01T10:00:00').getTime()
      );
    });
  });
});