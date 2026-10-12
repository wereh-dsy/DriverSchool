import { WHEEL_IDS } from '../physics/WheelContact';
import type { TPMSState } from '../TPMSState';
/** A reusable canvas page, independent of vehicle simulation and UI navigation. */
export interface LuxuryVehicleStatusData {
  readonly vehicleName: string;
  readonly tpmsState?: TPMSState;
  readonly fuelLevel?: number;
  readonly engineTemperatureC?: number;
  readonly transmissionTemperatureC?: number;
  readonly tyrePressureKPa?: Readonly<Partial<Record<'FL' | 'FR' | 'RL' | 'RR', number>>>;
  readonly tyres?: readonly import('../SharedVehicleData').LegacyTyreReading[];
}
const FONT = '"Segoe UI", "Microsoft YaHei", Arial, sans-serif';
const WHEELS = ['FL','FR','RL','RR'] as const;
const valid = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value);
export const tyrePressureReading = (data: LuxuryVehicleStatusData, index: number): number | undefined => {
  const id = WHEEL_IDS[index];
  if (!id) return undefined;
  const sensor = data.tpmsState?.[id];
  const pressure = data.tpmsState ? (data.tpmsState.available && sensor?.valid ? sensor.pressureKPa ?? undefined : undefined) :
    data.tyres ? (data.tyres[index]?.valid ? data.tyres[index]?.pressure ?? undefined : undefined) : data.tyrePressureKPa?.[WHEELS[index]!];
  return pressure !== undefined && Number.isFinite(pressure) && pressure > 0 ? pressure : undefined;
};
export const tyrePressureWarning = (data: LuxuryVehicleStatusData, index: number): boolean => {
  const id = WHEEL_IDS[index], status = id && data.tpmsState?.[id];
  return data.tpmsState ? !!(data.tpmsState.available && status && status.valid && status.pressureState !== 'NORMAL') :
    data.tyres?.[index]?.warning === true;
};
export const pressureText = (value: number | undefined): string => value === undefined ? '--' : String(Math.round(value));
export const tpmsDisplayKey = (state: TPMSState | undefined, legacy?: LuxuryVehicleStatusData['tyres']): string => state ?
  `${state.available}|${state.warning}|${WHEEL_IDS.map(id => `${state[id].valid}:${state[id].pressureKPa}:${state[id].pressureState}`).join('|')}` :
  legacy?.map(tyre => `${tyre.valid}:${tyre.pressure === null ? '--' : Math.round(tyre.pressure)}:${tyre.warning}`).join('|') ?? '';
const reading = (value: number | undefined, fallback: number) => (valid(value) ? '' : '~ ') + Math.round(valid(value) ? value : fallback);

/** The key includes every displayed input and ignores sub-unit fluctuations. */
export function luxuryVehicleStatusKey(data: LuxuryVehicleStatusData, on: boolean): string {
  return [on,data.vehicleName,reading(valid(data.fuelLevel)?Math.max(0,Math.min(1,data.fuelLevel))*100:undefined,70),
    reading(data.engineTemperatureC,90),reading(data.transmissionTemperatureC,80),
    ...WHEELS.map((_,index)=>pressureText(tyrePressureReading(data,index))),
    ...WHEELS.map((_,index)=>tyrePressureWarning(data,index))].join('|');
}

export function drawLuxuryVehicleStatusPage(c: CanvasRenderingContext2D, data: LuxuryVehicleStatusData, on: boolean): void {
  c.fillStyle = '#05090d'; c.fillRect(0,0,1024,416);
  if (!on) return;
  c.imageSmoothingEnabled = true;
  const text = (value: string,x: number,y: number,size: number,color='#d9e3ea',weight=400,align:CanvasTextAlign='left') => {
    c.font = `${weight} ${size}px ${FONT}`; c.fillStyle=color; c.textAlign=align; c.textBaseline='middle'; c.fillText(value,x,y);
  };
  const background = c.createLinearGradient(0,0,1024,416);
  background.addColorStop(0,'#111b24'); background.addColorStop(.5,'#080e14'); background.addColorStop(1,'#05090d');
  c.fillStyle=background; c.fillRect(0,0,1024,416);
  text('VEHICLE STATUS',42,35,20,'#9cb0bf',500);
  text(data.vehicleName,42,79,37,'#edf2f5',500);
  c.fillStyle='#334550'; c.fillRect(42,111,940,1); c.fillRect(459,140,1,196); c.fillRect(42,362,940,1);
  text('Fuel',42,148,24,'#a1b4c2');
  text(reading(valid(data.fuelLevel)?Math.max(0,Math.min(1,data.fuelLevel))*100:undefined,70)+' %',42,194,47,'#e6edf2',500);
  const fuel = valid(data.fuelLevel)?Math.max(0,Math.min(1,data.fuelLevel)):.7;
  c.fillStyle='#283b49'; c.fillRect(42,231,330,4); c.fillStyle=fuel<.1?'#d8b077':'#8baec6'; c.fillRect(42,231,330*fuel,4);
  text('Engine Temperature',42,282,23,'#a1b4c2');
  text(reading(data.engineTemperatureC,90)+' °C',42,323,34,'#dbe5ec',500);
  text('Tyre Pressure',506,148,24,'#a1b4c2'); text('kPa',980,148,21,'#8fa5b5',400,'right');
  WHEELS.forEach((wheel,index)=>{
    const x=506+(index%2)*252,y=200+Math.floor(index/2)*55;
    text(wheel+':',x,y,21,'#879dab');
    text(pressureText(tyrePressureReading(data,index)),x+63,y,30,tyrePressureWarning(data,index)?'#d8b077':'#dce7ef',500);
  });
  text('Transmission Temperature',506,314,21,'#a1b4c2');
  text(reading(data.transmissionTemperatureC,80)+' °C',980,314,30,'#dbe5ec',500,'right');
  const hasReference = !valid(data.fuelLevel)||!valid(data.engineTemperatureC)||!valid(data.transmissionTemperatureC)||WHEELS.some((_,i)=>!valid(tyrePressureReading(data,i)));
  text(hasReference?'~ Reference values':'Vehicle readings',42,389,18,'#7d929f');
}
