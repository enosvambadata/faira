// Listing category taxonomy for the auto-parts vertical.
//
// Faira Market pivoted from a general marketplace to a car parts & engines
// vertical (see docs/marketplace/00-vehicle-fitment-spec.md and the pivot
// note). Categories tell a buyer *what kind of part* something is; the
// fitment filter ("My Garage") tells them *whether it fits their car* — the
// two together are the vertical. Weighted to the Zimbabwe ex-Japan fleet:
// used engines/gearboxes and imported service parts lead.
//
// Consumed by prisma/seed.ts, which upserts these by slug (so trimming a
// branch here just stops re-seeding it; it never deletes existing rows).
// Slugs must be globally unique across the whole tree — categoryTaxonomy.test.ts
// guards that.

export interface CategoryNode {
  slug: string;
  name: string;
  icon: string;
  children?: CategoryNode[];
}

export const AUTO_PARTS_TAXONOMY: CategoryNode[] = [
  {
    slug: 'engines-drivetrain',
    name: 'Engines & Drivetrain',
    icon: '🔧',
    children: [
      { slug: 'complete-engines', name: 'Complete Engines', icon: '🔩' },
      { slug: 'engine-parts', name: 'Engine Parts', icon: '⚙️' },
      { slug: 'gearboxes-transmissions', name: 'Gearboxes & Transmissions', icon: '🔧' },
      { slug: 'clutches-flywheels', name: 'Clutches & Flywheels', icon: '⚙️' },
      { slug: 'turbochargers', name: 'Turbochargers', icon: '🌀' },
      { slug: 'driveshafts-cv-joints', name: 'Driveshafts & CV Joints', icon: '🔩' },
      { slug: 'radiators-cooling', name: 'Radiators & Cooling', icon: '❄️' },
    ],
  },
  {
    slug: 'suspension-steering',
    name: 'Suspension & Steering',
    icon: '🛞',
    children: [
      { slug: 'shocks-struts', name: 'Shock Absorbers & Struts', icon: '🛞' },
      { slug: 'springs', name: 'Springs', icon: '🌀' },
      { slug: 'control-arms-ball-joints', name: 'Control Arms & Ball Joints', icon: '🔩' },
      { slug: 'steering-racks', name: 'Steering Racks & Pumps', icon: '🎛️' },
      { slug: 'wheel-bearings-hubs', name: 'Wheel Bearings & Hubs', icon: '⚙️' },
    ],
  },
  {
    slug: 'brakes',
    name: 'Brakes',
    icon: '🛑',
    children: [
      { slug: 'brake-pads', name: 'Brake Pads', icon: '🛑' },
      { slug: 'brake-discs-drums', name: 'Brake Discs & Drums', icon: '💿' },
      { slug: 'brake-calipers', name: 'Calipers', icon: '🔩' },
      { slug: 'brake-lines-cylinders', name: 'Lines & Master Cylinders', icon: '🧰' },
    ],
  },
  {
    slug: 'body-exterior',
    name: 'Body & Exterior',
    icon: '🚗',
    children: [
      { slug: 'bumpers', name: 'Bumpers', icon: '🚗' },
      { slug: 'bonnets-fenders', name: 'Bonnets & Fenders', icon: '🚙' },
      { slug: 'doors-mirrors', name: 'Doors & Mirrors', icon: '🪞' },
      { slug: 'lights-indicators', name: 'Lights & Indicators', icon: '💡' },
      { slug: 'windscreens-glass', name: 'Windscreens & Glass', icon: '🪟' },
      { slug: 'grilles-trim', name: 'Grilles & Exterior Trim', icon: '🔲' },
    ],
  },
  {
    slug: 'electrical-ignition',
    name: 'Electrical & Ignition',
    icon: '🔋',
    children: [
      { slug: 'batteries', name: 'Batteries', icon: '🔋' },
      { slug: 'alternators-starters', name: 'Alternators & Starters', icon: '⚡' },
      { slug: 'sensors', name: 'Sensors', icon: '📡' },
      { slug: 'ecus-wiring', name: 'ECUs & Wiring', icon: '🔌' },
      { slug: 'ignition-plugs-coils', name: 'Ignition — Plugs & Coils', icon: '🕯️' },
    ],
  },
  {
    slug: 'interior-accessories',
    name: 'Interior & Accessories',
    icon: '🪑',
    children: [
      { slug: 'seats-upholstery', name: 'Seats & Upholstery', icon: '🪑' },
      { slug: 'dashboards-trim', name: 'Dashboards & Interior Trim', icon: '🎛️' },
      { slug: 'infotainment-audio', name: 'Infotainment & Audio', icon: '📻' },
      { slug: 'mats-covers', name: 'Mats & Covers', icon: '🧽' },
    ],
  },
  {
    slug: 'service-maintenance',
    name: 'Service & Maintenance',
    icon: '🧰',
    children: [
      { slug: 'filters', name: 'Filters (Oil, Air, Fuel, Cabin)', icon: '🧴' },
      { slug: 'belts-chains', name: 'Belts & Timing Chains', icon: '⛓️' },
      { slug: 'oils-fluids', name: 'Oils & Fluids', icon: '🛢️' },
      { slug: 'wipers', name: 'Wipers', icon: '🌧️' },
    ],
  },
  {
    slug: 'wheels-tyres',
    name: 'Wheels & Tyres',
    icon: '🛞',
    children: [
      { slug: 'tyres', name: 'Tyres', icon: '🛞' },
      { slug: 'alloy-wheels-rims', name: 'Alloy Wheels & Rims', icon: '☸️' },
      { slug: 'wheel-accessories', name: 'Wheel Accessories', icon: '🔩' },
    ],
  },
  {
    slug: 'exhaust-emissions',
    name: 'Exhaust & Emissions',
    icon: '💨',
    children: [
      { slug: 'exhaust-systems', name: 'Exhaust Systems', icon: '💨' },
      { slug: 'catalytic-converters', name: 'Catalytic Converters', icon: '♻️' },
      { slug: 'mufflers-silencers', name: 'Mufflers & Silencers', icon: '🔇' },
    ],
  },
  {
    slug: 'whole-vehicles',
    name: 'Whole Vehicles',
    icon: '🚙',
    children: [
      { slug: 'cars', name: 'Cars', icon: '🚗' },
      { slug: 'bakkies-pickups', name: 'Bakkies & Pickups', icon: '🛻' },
      { slug: 'motorbikes', name: 'Motorbikes', icon: '🏍️' },
      { slug: 'non-runners-for-parts', name: 'Non-runners / For Parts', icon: '🔧' },
    ],
  },
];

// Flattened list of every slug in the tree — used by the seed to report a
// count and by the test to assert global uniqueness.
export function allCategorySlugs(nodes: CategoryNode[] = AUTO_PARTS_TAXONOMY): string[] {
  return nodes.flatMap(node => [node.slug, ...allCategorySlugs(node.children ?? [])]);
}
