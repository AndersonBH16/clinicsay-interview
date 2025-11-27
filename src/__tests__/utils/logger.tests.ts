import { Logger } from '../../utils/logger';

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should log info messages', () => {
    Logger.info('Test message');
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('should log error messages', () => {
    Logger.error('Error message');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should log success messages', () => {
    Logger.success('Success message');
    expect(consoleLogSpy).toHaveBeenCalled();
  });
});