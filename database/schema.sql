-- Esquema base para la prueba técnica de migración
-- Motor: PostgreSQL

CREATE SCHEMA IF NOT EXISTS clinic;
SET search_path TO clinic, public;

-- Tipos auxiliares
CREATE TYPE appointment_status AS ENUM ('scheduled', 'completed', 'cancelled');
CREATE TYPE visit_modality     AS ENUM ('in_person', 'online');

-- Médicos obtenidos desde Doctoralia
CREATE TABLE doctors (
                         id                  BIGSERIAL PRIMARY KEY,
                         full_name           TEXT        NOT NULL,
                         specialty           TEXT        NOT NULL,
                         city                TEXT        NOT NULL,
                         address             TEXT,
                         phone_country_code  VARCHAR(8),     -- ej: "+51"
                         phone_number        VARCHAR(32),    -- número sin el prefijo
                         rating              NUMERIC(2,1),   -- ej: 4.7
                         review_count        INTEGER,
                         source_profile_url  TEXT        NOT NULL
);

-- Tratamientos / servicios que ofrece cada médico
CREATE TABLE treatments (
                            id          BIGSERIAL PRIMARY KEY,
                            doctor_id   BIGINT      NOT NULL REFERENCES doctors(id),
                            name        TEXT        NOT NULL,
                            price       NUMERIC(10,2),          -- opcional, si se puede inferir
                            currency    CHAR(3),                -- ej: "PEN"
                            duration_minutes SMALLINT           -- opcional
);

-- Evitar tratamientos duplicados por médico
CREATE UNIQUE INDEX ux_treatments_doctor_name
    ON treatments(doctor_id, name);

-- Disponibilidad real del médico (obtenida de Doctoralia)
-- Cada fila representa un bloque de tiempo disponible
CREATE TABLE doctor_availability (
                                     id          BIGSERIAL PRIMARY KEY,
                                     doctor_id   BIGINT          NOT NULL REFERENCES doctors(id),
                                     start_at    TIMESTAMPTZ     NOT NULL,
                                     end_at      TIMESTAMPTZ     NOT NULL,
                                     modality    visit_modality  NOT NULL
);

CREATE INDEX idx_doctor_availability_doctor_id
    ON doctor_availability(doctor_id);

CREATE INDEX idx_doctor_availability_start_at
    ON doctor_availability(start_at);

-- Pacientes ficticios generados por el candidato
CREATE TABLE patients (
                          id              BIGSERIAL PRIMARY KEY,
                          full_name       TEXT        NOT NULL,
                          document_number VARCHAR(32),
                          phone_number    VARCHAR(32),
                          email           TEXT
);

-- Citas médicas ficticias, basadas en la disponibilidad real del médico
-- Cada cita:
--  - referencia un médico
--  - referencia un paciente
--  - referencia un tratamiento del mismo médico
CREATE TABLE appointments (
                              id              BIGSERIAL PRIMARY KEY,
                              doctor_id       BIGINT              NOT NULL REFERENCES doctors(id),
                              patient_id      BIGINT              NOT NULL REFERENCES patients(id),
                              treatment_id    BIGINT              NOT NULL REFERENCES treatments(id),
                              start_at        TIMESTAMPTZ         NOT NULL,
                              end_at          TIMESTAMPTZ         NOT NULL,
                              status          appointment_status  NOT NULL DEFAULT 'scheduled'
);

CREATE INDEX idx_appointments_doctor_id
    ON appointments(doctor_id);

CREATE INDEX idx_appointments_patient_id
    ON appointments(patient_id);

CREATE INDEX idx_appointments_treatment_id
    ON appointments(treatment_id);

CREATE INDEX idx_appointments_start_at
    ON appointments(start_at);
