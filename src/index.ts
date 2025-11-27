import dotenv from 'dotenv';
import { Database } from './config/database';
import { Logger } from './utils/logger';
import { ErrorTracker } from './utils/error-tracker';
import { WaitForDb } from './utils/waitForDB';
import { DoctoraliaScraper } from './scrapers/doctoralia.scraper';
import { PatientGenerator } from './generators/patient.generator';
import { AppointmentGenerator } from './generators/appointment.generator';
import { MigrationService } from './services/migration.service';

dotenv.config();

async function main() {
  Logger.info('='.repeat(60));
  Logger.info('DOCTORALIA DATA MIGRATION PIPELINE');
  Logger.info('='.repeat(60));

  try {
    const dbHost = process.env.DB_HOST || 'db';
    const dbPort = parseInt(process.env.DB_PORT || '5432');

    await WaitForDb.wait({ host: dbHost, port: dbPort });
    await Database.connect();

    const prisma = Database.getInstance();
    const migrationService = new MigrationService(prisma);
    const existingDoctors = await prisma.doctors.count();

    if (existingDoctors > 0) {
      Logger.warn(`\n⚠️  Database already contains ${existingDoctors} doctors`);
      Logger.warn('Skipping data migration to prevent duplicates.');
      Logger.info('\nTo re-run migration, delete the database volume. You can execute:');
      Logger.info('  docker-compose down -v');
      Logger.info('  docker-compose up --build\n');

      await migrationService.getStats();
      await Database.disconnect();
      process.exit(0);
    }

    // ⭐ Limpiar errores previos
    ErrorTracker.clear();

    Logger.info('\n[STEP 1/4] Scraping doctors from Doctoralia...');
    const scraper = new DoctoraliaScraper();
    const doctorsData = await scraper.scrapeDoctors();

    if (doctorsData.length === 0) {
      throw new Error('No doctors data obtained');
    }

    Logger.info('\n[STEP 2/4] Inserting doctors into database...');
    const insertedDoctors = await migrationService.insertDoctors(doctorsData);

    Logger.info('\n[STEP 3/4] Generating and inserting patients...');
    const patientGenerator = new PatientGenerator();
    const patientsData = patientGenerator.generate();
    const insertedPatients = await migrationService.insertPatients(patientsData);

    Logger.info('\n[STEP 4/4] Generating and inserting appointments...');
    const appointmentGenerator = new AppointmentGenerator();
    const appointmentsData = appointmentGenerator.generate(insertedDoctors, insertedPatients);
    await migrationService.insertAppointments(appointmentsData);

    Logger.info('\n');
    await migrationService.getStats();
    ErrorTracker.printSummary();

    Logger.success('\n✓ Migration pipeline completed successfully!');

    if (ErrorTracker.hasErrors()) {
      Logger.warn(`⚠️  Pipeline completed with ${ErrorTracker.getErrorCount()} errors (see summary above)`);
    }

    await Database.disconnect();
    process.exit(0);

  } catch (error) {
    Logger.error('Migration pipeline failed', error);
    ErrorTracker.printSummary();

    await Database.disconnect();
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  Logger.info('Received SIGTERM signal, shutting down gracefully...');
  await Database.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  Logger.info('Received SIGINT signal, shutting down gracefully...');
  await Database.disconnect();
  process.exit(0);
});

main();