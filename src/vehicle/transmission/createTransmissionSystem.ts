import type { TransmissionConfig } from '../config';
import type { AutoClutchController } from '../physics/AutoClutchController';
import type { Clutch } from '../physics/Clutch';
import type { Gearbox } from '../physics/Gearbox';
import type { TransmissionSystem } from './TransmissionSystem';
import { ManualTransmissionSystem } from './manual/ManualTransmissionSystem';
import { AutomaticTransmissionSystem } from './automatic/AutomaticTransmissionSystem';
import { DualClutchTransmissionSystem } from './dct/DualClutchTransmissionSystem';
import { CVTTransmissionSystem } from './cvt/CVTTransmissionSystem';

export function createTransmissionSystem(config: TransmissionConfig, gearbox: Gearbox,
  clutch: Clutch, autoClutch: AutoClutchController, wheelRadius = 0.315): TransmissionSystem {
  if (config.type === 'TORQUE_CONVERTER_AT') {
    if (config.automatic === undefined) throw new Error('TORQUE_CONVERTER_AT requires automatic calibration.');
    return new AutomaticTransmissionSystem(gearbox, config.automatic, wheelRadius);
  }
  if (config.type === 'DCT') {
    if (config.dct === undefined) throw new Error('DCT requires dual-clutch calibration.');
    return new DualClutchTransmissionSystem(gearbox, config.dct, wheelRadius);
  }
  if (config.type === 'CVT') {
    if (config.cvt === undefined) throw new Error('CVT requires variator calibration.');
    return new CVTTransmissionSystem(gearbox, config.cvt, wheelRadius);
  }
  return new ManualTransmissionSystem(gearbox, clutch, autoClutch);
}
