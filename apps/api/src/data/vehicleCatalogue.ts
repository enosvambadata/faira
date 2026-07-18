// Curated vehicle catalogue for the auto-parts fitment filter ("My Garage").
//
// Zimbabwe's fleet is overwhelmingly ex-Japan grey imports, so this list is
// deliberately weighted to the makes/models that actually move on the road
// here rather than a global vehicle database. ~20 makes / ~150 models covers
// the vast majority of parts demand. It's curated on purpose: the fitment
// filter only works if make/model are canonical (see
// docs/marketplace/00-vehicle-fitment-spec.md). Long-tail / oddball vehicles
// are handled by the free-text `note` on a fitment row and the universal-fit
// flag, not by expanding this list indefinitely.
//
// Consumed by prisma/seed.ts to upsert VehicleMake + VehicleModel rows.

export interface VehicleMakeCatalogue {
  make: string;
  models: string[];
}

export const VEHICLE_CATALOGUE: VehicleMakeCatalogue[] = [
  {
    make: 'Toyota',
    models: [
      'Vitz', 'Yaris', 'Passo', 'Aqua', 'Prius', 'Corolla', 'Corolla Fielder',
      'Corolla Runx', 'Allex', 'Runx', 'Allion', 'Premio', 'Avensis', 'Camry',
      'Mark X', 'Wish', 'Ractis', 'Fun Cargo', 'Ist', 'Belta', 'Probox',
      'Succeed', 'Spacio', 'Noah', 'Voxy', 'Isis', 'Hiace', 'Quantum', 'Dyna',
      'RAV4', 'Harrier', 'Fortuner', 'Land Cruiser', 'Land Cruiser Prado',
      'Hilux', 'Hilux Surf', 'Rush', 'Raum',
    ],
  },
  {
    make: 'Honda',
    models: [
      'Fit', 'Fit Aria', 'Fit Shuttle', 'Jazz', 'Civic', 'Accord', 'Insight',
      'Vezel', 'Freed', 'Stream', 'Airwave', 'CR-V', 'HR-V', 'Stepwgn',
    ],
  },
  {
    make: 'Nissan',
    models: [
      'March', 'Note', 'Tiida', 'Latio', 'Sunny', 'Sylphy', 'Bluebird',
      'Almera', 'Wingroad', 'AD Van', 'Serena', 'X-Trail', 'Juke', 'Qashqai',
      'Dualis', 'Navara', 'NP200', 'NP300', 'Hardbody', 'Caravan', 'Elgrand',
      'Fuga', 'Teana',
    ],
  },
  {
    make: 'Mazda',
    models: [
      'Demio', 'Mazda2', 'Familia', 'Axela', 'Mazda3', 'Atenza', 'Mazda6',
      'Premacy', 'Verisa', 'Bongo', 'BT-50', 'CX-3', 'CX-5', 'CX-7',
    ],
  },
  {
    make: 'Mitsubishi',
    models: [
      'Colt', 'Mirage', 'Lancer', 'Galant', 'Chariot', 'RVR', 'Outlander',
      'ASX', 'Pajero', 'Pajero IO', 'Triton', 'L200', 'Canter', 'Fuso',
    ],
  },
  {
    make: 'Isuzu',
    models: [
      'KB', 'D-Max', 'Trooper', 'Bighorn', 'Wizard', 'Frontier', 'Faster',
      'NPR', 'NKR', 'Elf', 'FRR',
    ],
  },
  {
    make: 'Subaru',
    models: ['Impreza', 'Legacy', 'Forester', 'Outback', 'XV', 'Levorg'],
  },
  {
    make: 'Suzuki',
    models: [
      'Swift', 'Alto', 'Celerio', 'Wagon R', 'Baleno', 'Vitara',
      'Grand Vitara', 'Escudo', 'Jimny', 'Ertiga',
    ],
  },
  {
    make: 'Mercedes-Benz',
    models: [
      'A-Class', 'C-Class', 'E-Class', 'S-Class', 'ML', 'GLE', 'GLA', 'GLC',
      'Sprinter', 'Vito', 'Viano',
    ],
  },
  {
    make: 'BMW',
    models: ['1 Series', '3 Series', '5 Series', '7 Series', 'X1', 'X3', 'X5', 'X6'],
  },
  {
    make: 'Volkswagen',
    models: [
      'Polo', 'Polo Vivo', 'Golf', 'Jetta', 'Passat', 'Tiguan', 'Touareg',
      'Amarok', 'Caddy', 'Transporter',
    ],
  },
  {
    make: 'Ford',
    models: ['Figo', 'Fiesta', 'Focus', 'EcoSport', 'Kuga', 'Ranger', 'Everest'],
  },
  {
    make: 'Land Rover',
    models: [
      'Defender', 'Discovery', 'Discovery Sport', 'Freelander',
      'Range Rover', 'Range Rover Sport', 'Range Rover Evoque',
    ],
  },
  {
    make: 'Hyundai',
    models: ['i10', 'i20', 'Accent', 'Elantra', 'Tucson', 'Santa Fe', 'H100', 'H1'],
  },
  {
    make: 'Kia',
    models: ['Picanto', 'Rio', 'Cerato', 'Sportage', 'Sorento', 'K2700'],
  },
  {
    make: 'Chevrolet',
    models: ['Spark', 'Aveo', 'Sonic', 'Cruze', 'Captiva', 'Trailblazer'],
  },
  {
    make: 'Jeep',
    models: ['Wrangler', 'Cherokee', 'Grand Cherokee', 'Compass'],
  },
  {
    make: 'Peugeot',
    models: ['206', '207', '301', '307', '308', '3008'],
  },
  {
    make: 'Renault',
    models: ['Kwid', 'Sandero', 'Duster', 'Clio', 'Megane'],
  },
  {
    make: 'Volvo',
    models: ['S40', 'S60', 'V40', 'XC60', 'XC90'],
  },
];

// Total model count, handy for the seed log line.
export const VEHICLE_MODEL_COUNT = VEHICLE_CATALOGUE.reduce(
  (sum, m) => sum + m.models.length,
  0,
);
