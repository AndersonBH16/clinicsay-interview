export interface ErrorReport {
  step: string;
  message: string;
  details?: any;
  timestamp: Date;
}

export class ErrorTracker {
  private static errors: ErrorReport[] = [];

  static addError(step: string, message: string, details?: any): void {
    this.errors.push({
      step,
      message,
      details: details?.message || details,
      timestamp: new Date(),
    });
  }

  static getErrors(): ErrorReport[] {
    return this.errors;
  }

  static hasErrors(): boolean {
    return this.errors.length > 0;
  }

  static getErrorCount(): number {
    return this.errors.length;
  }

  static getErrorsByStep(step: string): ErrorReport[] {
    return this.errors.filter(e => e.step === step);
  }

  static printSummary(): void {
    if (this.errors.length === 0) {
      console.log('\n✅ No errors during migration');
      return;
    }

    console.log('\n' + '='.repeat(60));
    console.log(`⚠️  ERROR SUMMARY: ${this.errors.length} errors occurred`);
    console.log('='.repeat(60));

    const errorsByStep: { [key: string]: ErrorReport[] } = {};

    this.errors.forEach(error => {
      if (!errorsByStep[error.step]) {
        errorsByStep[error.step] = [];
      }
      errorsByStep[error.step].push(error);
    });

    Object.entries(errorsByStep).forEach(([step, errors]) => {
      console.log(`\n📍 ${step}: ${errors.length} errors`);
      errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error.message}`);
        if (error.details) {
          console.log(`      └─ ${error.details}`);
        }
      });
    });

    console.log('\n' + '='.repeat(60));
  }

  static clear(): void {
    this.errors = [];
  }
}