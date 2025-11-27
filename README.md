# Clinicsay - Pipeline Migration

Pipeline automatizado de migración de datos que extrae información pública de médicos desde la página web de 
Doctoralia mediante técnica de scraping y la carga en una base de datos PostgreSQL usando TypeScript, Prisma ORM y Docker.

## 📋 Requisitos Previos

- **Docker** (versión 20.10 o superior)
- **Docker Compose** (versión 2.0 o superior)
- **Git**

## Información Técnica del Proyecto

Este documento contiene explicaciones técnicas de como se abordó el proyecto y como se llegó a la solución final.

## 🚀 Instrucciones de Instalación y Ejecución

El repositorio oficial del proyecto es: https://github.com/AndersonBH16/clinicsay-interview

### 1. Clonar o descargar el proyecto
```bash
# Si usas Git
git clone https://github.com/AndersonBH16/clinicsay-interview.git
cd clinicsay-app

# O simplemente crea la carpeta y copia los archivos
```

### 2. Configurar variables de entorno
Remombrar el archivo .env.example a .env (Para efectos de prueba compartiré como debe ser el archivo .env)

Puedes ajustar las variables en `.env` según tus necesidades:
```env
# Database Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=clinic
DB_HOST=db
DB_PORT=5432
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${DB_HOST}:${DB_PORT}/${POSTGRES_DB}?schema=clinic"

# Scraper Configuration
DOCTORALIA_BASE_URL=https://www.doctoralia.pe
TARGET_CITIES=Lima,Trujillo
TARGET_SPECIALTIES=cardiologia,dermatologia
MAX_DOCTORS_PER_SPECIALTY=45

USE_REAL_AVAILABILITY=true

# Data Generation
NUM_PATIENTS=100
NUM_APPOINTMENTS_PER_DOCTOR=10

# Application
NODE_ENV=production
```

### 3. Ejecutar el pipeline completo

**Un solo comando para todo:**
```bash
docker-compose up -d --build
```

Esto hará:
- Descargar las imágenes de Docker necesarias
- Construir el contenedor de la aplicación
- Levantar PostgreSQL
- Crear el esquema de base de datos
- Esperar a que la DB esté lista
- Ejecutar el pipeline de migración completo

### 4. Ver los logs
```bash
# Ver logs en tiempo real
docker-compose logs -f app

# Ver logs de la base de datos
docker-compose logs -f db

# Ver logs de ambos
docker-compose logs -f
```

**Salida esperada:**
```
INFO: ============================================================
INFO: DOCTORALIA DATA MIGRATION PIPELINE
INFO: ============================================================
INFO: Waiting for database at db:5432...
✓ SUCCESS: Database is ready at db:5432
INFO: Prisma Client initialized
✓ SUCCESS: Database connection established
INFO:
[STEP 1/4] Scraping doctors from Doctoralia...
INFO: Starting doctor scraping...
INFO: Scraping Lima...
INFO: Page 1: https://www.doctoralia.pe/buscar?q=&loc=Lima&page=1
INFO: Found 17 doctors
INFO: Page 2: https://www.doctoralia.pe/buscar?q=&loc=Lima&page=2
INFO: Found 20 doctors
INFO: Page 3: https://www.doctoralia.pe/buscar?q=&loc=Lima&page=3
INFO: Found 17 doctors
[STEP 2/4] Inserting doctors into database...
INFO: Inserting doctors...
✓ SUCCESS: Inserted 90 doctors
INFO:
[STEP 3/4] Generating and inserting patients...
INFO: Generating 100 patients...
✓ SUCCESS: Generated 100 patients
INFO: Inserting patients...
✓ SUCCESS: Inserted 100 patients
INFO:
[STEP 4/4] Generating and inserting appointments...
INFO: Generating appointments...
✓ SUCCESS: Generated 900 appointments
INFO: Inserting appointments...
✓ SUCCESS: Inserted 900 appointments
INFO:
INFO: Database stats...
INFO: ==================================================
INFO: DATABASE STATISTICS
INFO: ==================================================
INFO: Doctors: 90
INFO: Treatments: 1357
INFO: Availability: 1800
INFO: Patients: 100
INFO: Appointments: 900
INFO: ==================================================
✅ No errors during migration
✓ SUCCESS:
✓ Migration pipeline completed successfully!
INFO: Database connection closed
npm notice
doctoralia-app exited with code 0

```

### 5. Verificar que todo funciona
```bash
# Ver contenedores corriendo
docker-compose ps

# Deberías ver:
# NAME              STATUS         PORTS
# doctoralia-db     Up (healthy)   0.0.0.0:5432->5432/tcp
# doctoralia-app    Up             0.0.0.0:3000->3000/tcp
```

## 🔍 Verificar los Datos

### Opción A: Usar Docker para conectarse a PostgreSQL

```cmd
docker-compose exec db psql -U postgres -d clinic
```

### Opción B: Usar un cliente externo

Conecta con cualquier cliente PostgreSQL (DBeaver, pgAdmin, TablePlus, etc.):

- **Host:** localhost
- **Port:** 5432
- **Database:** clinic
- **Username:** postgres
- **Password:** postgres
- **Schema:** clinic

## 🔄 Comandos para interactuar con Docker

### Reiniciar todo desde cero
```bash
# Detener y eliminar todo (incluyendo datos)
docker-compose down -v

# Volver a levantar
docker-compose up -d --build
```

### Detener los contenedores (mantener datos)
```bash
docker-compose stop
```

### Iniciar contenedores detenidos
```bash
docker-compose start
```

### Ver logs de un contenedor específico
```bash
docker-compose logs app
docker-compose logs db
```

### Ejecutar comandos dentro del contenedor
```bash
# Entrar al contenedor de la app (elegir uno)
docker-compose exec app sh
docker-compose exec app bash

# Entrar al contenedor de la DB (elegir uno)
docker-compose exec db sh
docker-compose exec db bash
```

### Limpiar todo (contenedores, volúmenes, imágenes)
```bash
docker-compose down -v --rmi all
```

## 🎯 Probar con Diferentes Configuraciones

### Más datos

Edita `.env`:
```env
MAX_DOCTORS_PER_SPECIALTY=30
NUM_PATIENTS=200
NUM_APPOINTMENTS_PER_DOCTOR=20
```

Luego:
```bash
docker-compose down -v
docker-compose up -d --build
```

### Diferentes ciudades y especialidades
```env
TARGET_CITIES=Lima,Cusco,Trujillo,Arequipa
TARGET_SPECIALTIES=cardiologia,dermatologia,pediatria,traumatologia
```

## Solución de Problemas

### Puerto 5432 ya está en uso

**Solución 1 - Cambiar el puerto:**

Edita `docker-compose.yml`:
```yaml
services:
  db:
    ports:
      - "5433:5432"  # Cambiar a 5433
```

**Solución 2 - Detener el PostgreSQL local:**

Windows:
```cmd
net stop postgresql-x64-14
```

Linux/Mac:
```bash
sudo systemctl stop postgresql
```

### No aparecen logs
```bash
# Ver estado de los contenedores
docker-compose ps

# Si el contenedor app está "Exited", ver por qué
docker-compose logs app

# Reiniciar
docker-compose restart app
```

### Error "Cannot connect to database"
```bash
# Verificar salud de la DB
docker-compose exec db pg_isready -U postgres

# Ver logs de la DB
docker-compose logs db

# Recrear el contenedor
docker-compose down -v
docker-compose up -d --build
```

## 📊 Estructura del Proyecto
```
doctoralia-migration/
├── src/
│   ├── index.ts                
│   ├── config/
│   │   └── database.ts
│   ├── scrapers/
│   │   └── doctoralia.scraper.ts
│   ├── generators/
│   │   ├── patient.generator.ts
│   │   └── appointment.generator.ts
│   ├── services/
│   │   └── migration.service.ts
│   └── utils/
│       ├── logger.ts
│       └── wait-for-db.ts
├── prisma/
│   └── schema.prisma
├── data/
│   │   ├── availability.json
│   │   └── doctos.json
│   │   └── treatments.json
├── database/
│   └── schema.sql
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── README.md
```
## Limitaciones del proyecto y mejoras

- **Limitaciones actuales:**
  - El scraper depende de la estructura actual de Doctoralia, cambios en el sitio pueden romperlo.
  - No se manejan proxies o rotación de IPs, lo que puede llevar a bloqueos si se hacen muchas solicitudes.
  - La generación de datos es básica y puede que se presente alguna inconsistencia en ciertos datos, pero pueden ser manejados mejorando y optimizando los algoritmos de scraping.
  - Para efecto de prueba, se utilizaron dos ciudades: Lima y Trujillo, y dos especialidades: Cardiología y Dermatología. Esto puede ser modificado en el archivo .env
  - 

## Entregables para la prueba técnica

1. ✅ URL del repositorio público en github con todos los archivos que se indican a continuación:
   https://github.com/AndersonBH16/clinicsay-interview


2. ✅ Código fuente TypeScript organizado (scripts para obtención, generación y carga de datos).
Configuración de Prisma (schema.prisma, migraciones si las usas, generación de client).

    
    Revisar dentro de la carpeta /src


3. ✅ Contenedores

    3.1.docker-compose.yml con los servicios db y app.
        
        Revisar el archivo docker-compose.yml en la raíz del proyecto.

    3.2 Dockerfile del servicio app.
        
        Revisar el archivo Dockerfile en la raíz del proyecto.

4. ✅ Archivo schema.sql (copiado desde el documento que se te entrega).


    Revisar dentro de la carpeta /database


5. ✅ Opcionalmente, archivos JSON intermedios (data/*.json) o scripts para generarlos.


    Se generan automáticamente dentro del contenedor, puedes ubicarlos en la carpeta /src/data si decides mapear un volumen.

 
6. ✅ Un archivo README.md claro, que explique:Requisitos previos.Cómo levantar el proyecto.
Qué hace el pipeline de migración.Limitaciones o supuestos importantes.


    Este archivo README.md contiene toda la información solicitada. Lo estás viendo justo ahora.

## Soporte

Si encuentras problemas:

1. Prueba reiniciar: `docker-compose down -v && docker-compose up -d --build`
2. Contacta al autor: [ander.bh.16@gmail.com]() - LinkedIn: [AndersonBH16](https://www.linkedin.com/in/andersonblas/)