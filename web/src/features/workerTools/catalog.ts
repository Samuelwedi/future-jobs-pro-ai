export type WorkerToolCategory =
  | 'Universal'
  | 'Construction'
  | 'Electrical'
  | 'Plumbing & HVAC'
  | 'Landscaping'
  | 'Cleaning & Facilities'
  | 'Logistics';

export type WorkerToolInput = {
  key: string;
  label: string;
  unit?: string;
  defaultValue?: number;
  min?: number;
  step?: number;
};

export type WorkerToolResult = { label: string; value: string };

export type WorkerToolDefinition = {
  id: string;
  title: string;
  category: WorkerToolCategory;
  description: string;
  inputs: WorkerToolInput[];
  calculate: (values: Record<string, number>) => WorkerToolResult[];
  caution?: string;
};

const positive = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero.`);
  return value;
};

const nonNegative = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} cannot be negative.`);
  return value;
};

const fixed = (value: number, digits = 2): string => Number(value.toFixed(digits)).toLocaleString();
const ceil = (value: number): string => Math.ceil(value).toLocaleString();

export const WORKER_TOOL_CATEGORIES: WorkerToolCategory[] = [
  'Universal', 'Construction', 'Electrical', 'Plumbing & HVAC',
  'Landscaping', 'Cleaning & Facilities', 'Logistics',
];

export const WORKER_TOOLS: WorkerToolDefinition[] = [
  {
    id: 'length-converter', title: 'Length converter', category: 'Universal',
    description: 'Convert metres into common metric and imperial field units.',
    inputs: [{ key: 'metres', label: 'Length', unit: 'm', defaultValue: 1, min: 0, step: 0.01 }],
    calculate: ({ metres }) => {
      nonNegative(metres, 'Length');
      return [
        { label: 'Millimetres', value: `${fixed(metres * 1000)} mm` },
        { label: 'Centimetres', value: `${fixed(metres * 100)} cm` },
        { label: 'Feet', value: `${fixed(metres * 3.280839895)} ft` },
        { label: 'Inches', value: `${fixed(metres * 39.37007874)} in` },
      ];
    },
  },
  {
    id: 'area-volume', title: 'Area & volume', category: 'Universal',
    description: 'Calculate rectangular area, perimeter and volume.',
    inputs: [
      { key: 'length', label: 'Length', unit: 'm', defaultValue: 4, min: 0, step: 0.01 },
      { key: 'width', label: 'Width', unit: 'm', defaultValue: 3, min: 0, step: 0.01 },
      { key: 'height', label: 'Height/depth', unit: 'm', defaultValue: 0.1, min: 0, step: 0.01 },
    ],
    calculate: ({ length, width, height }) => {
      positive(length, 'Length'); positive(width, 'Width'); nonNegative(height, 'Height/depth');
      return [
        { label: 'Area', value: `${fixed(length * width)} m²` },
        { label: 'Perimeter', value: `${fixed(2 * (length + width))} m` },
        { label: 'Volume', value: `${fixed(length * width * height, 3)} m³` },
      ];
    },
  },
  {
    id: 'waste-cost', title: 'Waste & cost allowance', category: 'Universal',
    description: 'Add a waste allowance and estimate material cost.',
    inputs: [
      { key: 'quantity', label: 'Base quantity', defaultValue: 100, min: 0, step: 0.01 },
      { key: 'waste', label: 'Waste allowance', unit: '%', defaultValue: 10, min: 0, step: 0.1 },
      { key: 'unitCost', label: 'Cost per unit', defaultValue: 2.5, min: 0, step: 0.01 },
    ],
    calculate: ({ quantity, waste, unitCost }) => {
      positive(quantity, 'Base quantity'); nonNegative(waste, 'Waste allowance'); nonNegative(unitCost, 'Cost');
      const adjusted = quantity * (1 + waste / 100);
      return [
        { label: 'Order quantity', value: fixed(adjusted, 2) },
        { label: 'Added waste', value: fixed(adjusted - quantity, 2) },
        { label: 'Estimated cost', value: `$${fixed(adjusted * unitCost, 2)}` },
      ];
    },
  },
  {
    id: 'slope-grade', title: 'Slope & grade', category: 'Universal',
    description: 'Convert rise and run into grade percentage and angle.',
    inputs: [
      { key: 'rise', label: 'Rise', unit: 'm', defaultValue: 0.3, min: 0, step: 0.001 },
      { key: 'run', label: 'Run', unit: 'm', defaultValue: 6, min: 0.001, step: 0.001 },
    ],
    calculate: ({ rise, run }) => {
      nonNegative(rise, 'Rise'); positive(run, 'Run');
      const ratio = rise / run;
      return [
        { label: 'Grade', value: `${fixed(ratio * 100, 2)}%` },
        { label: 'Angle', value: `${fixed(Math.atan(ratio) * 180 / Math.PI, 2)}°` },
        { label: 'Ratio', value: rise === 0 ? 'Level' : `1 : ${fixed(run / rise, 2)}` },
      ];
    },
  },
  {
    id: 'equal-spacing', title: 'Equal spacing', category: 'Construction',
    description: 'Lay out balusters, posts, lights or fixtures with equal clear spaces.',
    inputs: [
      { key: 'overall', label: 'Overall inside length', unit: 'mm', defaultValue: 2400, min: 0, step: 1 },
      { key: 'itemWidth', label: 'Item width', unit: 'mm', defaultValue: 38, min: 0, step: 0.1 },
      { key: 'items', label: 'Number of items', defaultValue: 10, min: 1, step: 1 },
    ],
    calculate: ({ overall, itemWidth, items }) => {
      positive(overall, 'Overall length'); positive(itemWidth, 'Item width');
      const count = Math.max(1, Math.floor(positive(items, 'Number of items')));
      const gap = (overall - count * itemWidth) / (count + 1);
      if (gap < 0) throw new Error('The items are wider than the available length.');
      return [
        { label: 'Clear gap', value: `${fixed(gap, 2)} mm` },
        { label: 'On-centre spacing', value: `${fixed(gap + itemWidth, 2)} mm` },
        { label: 'Total item width', value: `${fixed(count * itemWidth, 2)} mm` },
      ];
    },
  },
  {
    id: 'concrete', title: 'Concrete quantity', category: 'Construction',
    description: 'Estimate concrete volume, waste allowance and approximate bag count.',
    inputs: [
      { key: 'length', label: 'Length', unit: 'm', defaultValue: 6, min: 0, step: 0.01 },
      { key: 'width', label: 'Width', unit: 'm', defaultValue: 3, min: 0, step: 0.01 },
      { key: 'depth', label: 'Depth', unit: 'mm', defaultValue: 100, min: 0, step: 1 },
      { key: 'waste', label: 'Waste allowance', unit: '%', defaultValue: 7, min: 0, step: 0.1 },
      { key: 'bagYield', label: 'Bag yield', unit: 'm³', defaultValue: 0.012, min: 0.001, step: 0.001 },
    ],
    calculate: ({ length, width, depth, waste, bagYield }) => {
      positive(length, 'Length'); positive(width, 'Width'); positive(depth, 'Depth'); nonNegative(waste, 'Waste'); positive(bagYield, 'Bag yield');
      const raw = length * width * depth / 1000;
      const order = raw * (1 + waste / 100);
      return [
        { label: 'Net concrete', value: `${fixed(raw, 3)} m³` },
        { label: 'Order volume', value: `${fixed(order, 3)} m³` },
        { label: 'Approximate bags', value: `${ceil(order / bagYield)} bags` },
      ];
    },
  },
  {
    id: 'decking', title: 'Decking boards', category: 'Construction',
    description: 'Estimate full-length decking boards including the selected waste allowance.',
    inputs: [
      { key: 'deckWidth', label: 'Deck width across boards', unit: 'm', defaultValue: 4, min: 0, step: 0.01 },
      { key: 'boardFace', label: 'Board face width', unit: 'mm', defaultValue: 140, min: 1, step: 1 },
      { key: 'gap', label: 'Gap', unit: 'mm', defaultValue: 5, min: 0, step: 0.5 },
      { key: 'waste', label: 'Waste allowance', unit: '%', defaultValue: 10, min: 0, step: 0.1 },
    ],
    calculate: ({ deckWidth, boardFace, gap, waste }) => {
      positive(deckWidth, 'Deck width'); positive(boardFace, 'Board width'); nonNegative(gap, 'Gap'); nonNegative(waste, 'Waste');
      const net = Math.ceil(deckWidth * 1000 / (boardFace + gap));
      return [
        { label: 'Boards before waste', value: `${net} boards` },
        { label: 'Boards to order', value: `${ceil(net * (1 + waste / 100))} boards` },
        { label: 'Coverage per board', value: `${fixed(boardFace + gap, 1)} mm` },
      ];
    },
  },
  {
    id: 'drywall', title: 'Drywall sheets', category: 'Construction',
    description: 'Estimate sheet count from wall dimensions and openings.',
    inputs: [
      { key: 'wallLength', label: 'Total wall length', unit: 'm', defaultValue: 12, min: 0, step: 0.01 },
      { key: 'wallHeight', label: 'Wall height', unit: 'm', defaultValue: 2.44, min: 0, step: 0.01 },
      { key: 'openings', label: 'Doors/windows', unit: 'm²', defaultValue: 3, min: 0, step: 0.01 },
      { key: 'sheetArea', label: 'Sheet coverage', unit: 'm²', defaultValue: 2.9768, min: 0.1, step: 0.0001 },
      { key: 'waste', label: 'Waste allowance', unit: '%', defaultValue: 10, min: 0, step: 0.1 },
    ],
    calculate: ({ wallLength, wallHeight, openings, sheetArea, waste }) => {
      positive(wallLength, 'Wall length'); positive(wallHeight, 'Wall height'); nonNegative(openings, 'Openings'); positive(sheetArea, 'Sheet coverage'); nonNegative(waste, 'Waste');
      const area = Math.max(0, wallLength * wallHeight - openings);
      return [
        { label: 'Net wall area', value: `${fixed(area)} m²` },
        { label: 'Sheets to order', value: `${ceil(area * (1 + waste / 100) / sheetArea)} sheets` },
      ];
    },
  },
  {
    id: 'paint', title: 'Paint coverage', category: 'Construction',
    description: 'Estimate litres of paint from surface area, coats and coverage.',
    inputs: [
      { key: 'area', label: 'Paintable area', unit: 'm²', defaultValue: 80, min: 0, step: 0.1 },
      { key: 'coats', label: 'Number of coats', defaultValue: 2, min: 1, step: 1 },
      { key: 'coverage', label: 'Coverage per litre', unit: 'm²/L', defaultValue: 10, min: 0.1, step: 0.1 },
      { key: 'waste', label: 'Waste allowance', unit: '%', defaultValue: 10, min: 0, step: 0.1 },
    ],
    calculate: ({ area, coats, coverage, waste }) => {
      positive(area, 'Area'); positive(coats, 'Coats'); positive(coverage, 'Coverage'); nonNegative(waste, 'Waste');
      const litres = area * Math.ceil(coats) / coverage * (1 + waste / 100);
      return [{ label: 'Paint required', value: `${fixed(litres, 1)} L` }, { label: '4 L containers', value: `${ceil(litres / 4)} containers` }];
    },
  },
  {
    id: 'roofing', title: 'Roofing quantity', category: 'Construction',
    description: 'Estimate sloped roof area and roofing squares.',
    inputs: [
      { key: 'planArea', label: 'Horizontal roof area', unit: 'm²', defaultValue: 120, min: 0, step: 0.1 },
      { key: 'pitchRise', label: 'Pitch rise per 12', defaultValue: 6, min: 0, step: 0.1 },
      { key: 'waste', label: 'Waste allowance', unit: '%', defaultValue: 12, min: 0, step: 0.1 },
    ],
    calculate: ({ planArea, pitchRise, waste }) => {
      positive(planArea, 'Horizontal area'); nonNegative(pitchRise, 'Pitch'); nonNegative(waste, 'Waste');
      const slopeFactor = Math.sqrt(144 + pitchRise * pitchRise) / 12;
      const area = planArea * slopeFactor * (1 + waste / 100);
      return [{ label: 'Order area', value: `${fixed(area)} m²` }, { label: 'Roofing squares', value: `${fixed(area / 9.290304, 2)} squares` }, { label: 'Slope factor', value: fixed(slopeFactor, 3) }];
    },
  },
  {
    id: 'asphalt', title: 'Asphalt tonnage', category: 'Construction',
    description: 'Estimate compacted asphalt tonnage using project dimensions and density.',
    inputs: [
      { key: 'length', label: 'Length', unit: 'm', defaultValue: 30, min: 0, step: 0.1 },
      { key: 'width', label: 'Width', unit: 'm', defaultValue: 6, min: 0, step: 0.1 },
      { key: 'depth', label: 'Compacted depth', unit: 'mm', defaultValue: 75, min: 0, step: 1 },
      { key: 'density', label: 'Density', unit: 't/m³', defaultValue: 2.4, min: 0.1, step: 0.01 },
      { key: 'waste', label: 'Waste allowance', unit: '%', defaultValue: 5, min: 0, step: 0.1 },
    ],
    calculate: ({ length, width, depth, density, waste }) => {
      positive(length, 'Length'); positive(width, 'Width'); positive(depth, 'Depth'); positive(density, 'Density'); nonNegative(waste, 'Waste');
      const volume = length * width * depth / 1000;
      return [{ label: 'Compacted volume', value: `${fixed(volume, 2)} m³` }, { label: 'Order tonnage', value: `${fixed(volume * density * (1 + waste / 100), 2)} t` }];
    },
  },
  {
    id: 'ohms-law', title: 'Ohm’s law', category: 'Electrical',
    description: 'Calculate current, resistance and power from voltage and load.',
    inputs: [
      { key: 'voltage', label: 'Voltage', unit: 'V', defaultValue: 120, min: 0.001, step: 0.1 },
      { key: 'power', label: 'Power/load', unit: 'W', defaultValue: 1500, min: 0.001, step: 1 },
    ],
    caution: 'Planning aid only. Electrical design and installation must follow applicable code and a qualified professional.',
    calculate: ({ voltage, power }) => {
      positive(voltage, 'Voltage'); positive(power, 'Power');
      const current = power / voltage;
      return [{ label: 'Current', value: `${fixed(current, 2)} A` }, { label: 'Equivalent resistance', value: `${fixed(voltage * voltage / power, 2)} Ω` }];
    },
  },
  {
    id: 'three-phase', title: 'Three-phase power', category: 'Electrical',
    description: 'Estimate balanced three-phase real power.',
    inputs: [
      { key: 'voltage', label: 'Line voltage', unit: 'V', defaultValue: 600, min: 0.001, step: 1 },
      { key: 'current', label: 'Line current', unit: 'A', defaultValue: 20, min: 0.001, step: 0.1 },
      { key: 'powerFactor', label: 'Power factor', defaultValue: 0.9, min: 0.01, step: 0.01 },
    ],
    caution: 'Planning aid only. Verify conductor, protection and code requirements with a qualified electrician.',
    calculate: ({ voltage, current, powerFactor }) => {
      positive(voltage, 'Voltage'); positive(current, 'Current'); positive(powerFactor, 'Power factor');
      if (powerFactor > 1) throw new Error('Power factor cannot exceed 1.');
      const watts = Math.sqrt(3) * voltage * current * powerFactor;
      return [{ label: 'Real power', value: `${fixed(watts / 1000, 2)} kW` }, { label: 'Apparent power', value: `${fixed(Math.sqrt(3) * voltage * current / 1000, 2)} kVA` }];
    },
  },
  {
    id: 'pipe-volume', title: 'Pipe volume', category: 'Plumbing & HVAC',
    description: 'Estimate internal pipe volume from inside diameter and length.',
    inputs: [
      { key: 'diameter', label: 'Inside diameter', unit: 'mm', defaultValue: 50, min: 0, step: 0.1 },
      { key: 'length', label: 'Pipe length', unit: 'm', defaultValue: 25, min: 0, step: 0.1 },
    ],
    calculate: ({ diameter, length }) => {
      positive(diameter, 'Inside diameter'); positive(length, 'Pipe length');
      const cubicMetres = Math.PI * Math.pow(diameter / 2000, 2) * length;
      return [{ label: 'Internal volume', value: `${fixed(cubicMetres * 1000, 2)} L` }, { label: 'US gallons', value: `${fixed(cubicMetres * 264.172052, 2)} gal` }];
    },
  },
  {
    id: 'air-changes', title: 'Air changes per hour', category: 'Plumbing & HVAC',
    description: 'Estimate ACH from room dimensions and supplied airflow.',
    inputs: [
      { key: 'length', label: 'Room length', unit: 'm', defaultValue: 8, min: 0, step: 0.1 },
      { key: 'width', label: 'Room width', unit: 'm', defaultValue: 6, min: 0, step: 0.1 },
      { key: 'height', label: 'Room height', unit: 'm', defaultValue: 3, min: 0, step: 0.1 },
      { key: 'airflow', label: 'Airflow', unit: 'L/s', defaultValue: 200, min: 0, step: 1 },
    ],
    caution: 'Ventilation requirements depend on occupancy, equipment and local mechanical code.',
    calculate: ({ length, width, height, airflow }) => {
      positive(length, 'Length'); positive(width, 'Width'); positive(height, 'Height'); positive(airflow, 'Airflow');
      const volume = length * width * height;
      return [{ label: 'Room volume', value: `${fixed(volume, 2)} m³` }, { label: 'Air changes', value: `${fixed(airflow * 3.6 / volume, 2)} ACH` }];
    },
  },
  {
    id: 'landscape-volume', title: 'Soil, mulch & gravel', category: 'Landscaping',
    description: 'Estimate landscaping material by area and installed depth.',
    inputs: [
      { key: 'length', label: 'Length', unit: 'm', defaultValue: 10, min: 0, step: 0.1 },
      { key: 'width', label: 'Width', unit: 'm', defaultValue: 5, min: 0, step: 0.1 },
      { key: 'depth', label: 'Depth', unit: 'cm', defaultValue: 8, min: 0, step: 0.1 },
      { key: 'waste', label: 'Settlement/waste', unit: '%', defaultValue: 10, min: 0, step: 0.1 },
    ],
    calculate: ({ length, width, depth, waste }) => {
      positive(length, 'Length'); positive(width, 'Width'); positive(depth, 'Depth'); nonNegative(waste, 'Waste');
      const volume = length * width * depth / 100 * (1 + waste / 100);
      return [{ label: 'Order volume', value: `${fixed(volume, 2)} m³` }, { label: 'Cubic yards', value: `${fixed(volume * 1.30795062, 2)} yd³` }];
    },
  },
  {
    id: 'fertilizer', title: 'Fertilizer application', category: 'Landscaping',
    description: 'Estimate product required from treatment area and label rate.',
    inputs: [
      { key: 'area', label: 'Treatment area', unit: 'm²', defaultValue: 1000, min: 0, step: 1 },
      { key: 'rate', label: 'Product rate', unit: 'kg/100m²', defaultValue: 2.5, min: 0, step: 0.1 },
    ],
    caution: 'Always follow the product label, local rules and required protective equipment.',
    calculate: ({ area, rate }) => {
      positive(area, 'Area'); positive(rate, 'Rate');
      return [{ label: 'Product required', value: `${fixed(area / 100 * rate, 2)} kg` }];
    },
  },
  {
    id: 'dilution', title: 'Cleaning dilution', category: 'Cleaning & Facilities',
    description: 'Calculate concentrate and water for a one-part-to-N-parts dilution.',
    inputs: [
      { key: 'finalVolume', label: 'Final solution', unit: 'L', defaultValue: 10, min: 0, step: 0.1 },
      { key: 'waterParts', label: 'Water parts for 1 part concentrate', defaultValue: 20, min: 0, step: 1 },
    ],
    caution: 'Never mix incompatible chemicals. Follow the product label and safety data sheet.',
    calculate: ({ finalVolume, waterParts }) => {
      positive(finalVolume, 'Final volume'); nonNegative(waterParts, 'Water parts');
      const concentrate = finalVolume / (waterParts + 1);
      return [{ label: 'Concentrate', value: `${fixed(concentrate, 3)} L` }, { label: 'Water', value: `${fixed(finalVolume - concentrate, 3)} L` }];
    },
  },
  {
    id: 'floor-productivity', title: 'Cleaning productivity', category: 'Cleaning & Facilities',
    description: 'Estimate labour hours and crew duration for an area.',
    inputs: [
      { key: 'area', label: 'Area', unit: 'm²', defaultValue: 2500, min: 0, step: 1 },
      { key: 'rate', label: 'Production rate', unit: 'm²/hr', defaultValue: 350, min: 0, step: 1 },
      { key: 'workers', label: 'Workers', defaultValue: 2, min: 1, step: 1 },
    ],
    calculate: ({ area, rate, workers }) => {
      positive(area, 'Area'); positive(rate, 'Production rate'); positive(workers, 'Workers');
      const labour = area / rate;
      return [{ label: 'Labour hours', value: `${fixed(labour, 2)} hr` }, { label: 'Crew duration', value: `${fixed(labour / Math.floor(workers), 2)} hr` }];
    },
  },
  {
    id: 'fuel-trip', title: 'Trip fuel & cost', category: 'Logistics',
    description: 'Estimate fuel use and cost for a return or one-way trip.',
    inputs: [
      { key: 'distance', label: 'Distance', unit: 'km', defaultValue: 250, min: 0, step: 1 },
      { key: 'consumption', label: 'Fuel consumption', unit: 'L/100km', defaultValue: 12, min: 0, step: 0.1 },
      { key: 'price', label: 'Fuel price', unit: '$/L', defaultValue: 1.5, min: 0, step: 0.01 },
      { key: 'trips', label: 'Number of trips', defaultValue: 1, min: 1, step: 1 },
    ],
    calculate: ({ distance, consumption, price, trips }) => {
      positive(distance, 'Distance'); positive(consumption, 'Consumption'); nonNegative(price, 'Fuel price'); positive(trips, 'Trips');
      const fuel = distance * Math.floor(trips) * consumption / 100;
      return [{ label: 'Fuel required', value: `${fixed(fuel, 2)} L` }, { label: 'Estimated fuel cost', value: `$${fixed(fuel * price, 2)}` }];
    },
  },
  {
    id: 'travel-time', title: 'Travel time', category: 'Logistics',
    description: 'Estimate driving duration using distance, average speed and stop allowance.',
    inputs: [
      { key: 'distance', label: 'Distance', unit: 'km', defaultValue: 180, min: 0, step: 1 },
      { key: 'speed', label: 'Average speed', unit: 'km/h', defaultValue: 80, min: 0, step: 1 },
      { key: 'stops', label: 'Stop allowance', unit: 'min', defaultValue: 30, min: 0, step: 1 },
    ],
    calculate: ({ distance, speed, stops }) => {
      positive(distance, 'Distance'); positive(speed, 'Speed'); nonNegative(stops, 'Stop allowance');
      const minutes = distance / speed * 60 + stops;
      return [{ label: 'Estimated duration', value: `${Math.floor(minutes / 60)} hr ${Math.round(minutes % 60)} min` }, { label: 'Total minutes', value: `${fixed(minutes, 0)} min` }];
    },
  },
];

export function initialToolValues(tool: WorkerToolDefinition): Record<string, number> {
  return Object.fromEntries(tool.inputs.map((input) => [input.key, input.defaultValue ?? 0]));
}
