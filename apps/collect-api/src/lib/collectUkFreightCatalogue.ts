// The standard UK -> Zimbabwe freight price list (UKZIM Direct rate card).
// Flat per-item prices in integer pence, in display order. Used to seed a
// company's editable freight rates so they start from a real catalogue rather
// than a blank page. Companies edit/extend from here.
export interface FreightCatalogueItem {
  category: string;
  itemName: string;
  pricePence: number;
}

export const UK_ZIM_FREIGHT_CATALOGUE: FreightCatalogueItem[] = [
  { category: 'Household & Appliances', itemName: 'Drums', pricePence: 35000 },
  { category: 'Household & Appliances', itemName: 'TVs', pricePence: 30000 },
  { category: 'Household & Appliances', itemName: 'Solar Panels', pricePence: 5000 },
  { category: 'Household & Appliances', itemName: 'Double Bed', pricePence: 30000 },
  { category: 'Household & Appliances', itemName: 'Bath Tub', pricePence: 20000 },
  { category: 'Household & Appliances', itemName: 'Microwave', pricePence: 7500 },

  { category: 'Luggage', itemName: 'Small Suitcases', pricePence: 13000 },
  { category: 'Luggage', itemName: 'X-Large Suitcases', pricePence: 17500 },
  { category: 'Luggage', itemName: 'Duffle Bags', pricePence: 20000 },

  { category: 'Bikes', itemName: 'Small Bike', pricePence: 4000 },
  { category: 'Bikes', itemName: 'Medium Bike', pricePence: 5000 },
  { category: 'Bikes', itemName: 'Adult Bike', pricePence: 8000 },

  { category: 'Wheels', itemName: 'Small Wheels', pricePence: 4000 },
  { category: 'Wheels', itemName: 'Medium Wheels', pricePence: 5500 },
  { category: 'Wheels', itemName: 'Truck Wheels', pricePence: 7000 },

  { category: 'Stoves', itemName: '4 Plate Stove', pricePence: 27500 },
  { category: 'Stoves', itemName: '6 Plate Stove', pricePence: 30000 },
  { category: 'Stoves', itemName: '7 Plate Stove', pricePence: 35000 },

  { category: 'Fridges', itemName: 'Double Door', pricePence: 45000 },
  { category: 'Fridges', itemName: 'Single Door', pricePence: 30000 },
  { category: 'Fridges', itemName: 'Under Table', pricePence: 20000 },

  { category: 'Sofas', itemName: 'Single Seat', pricePence: 30000 },
  { category: 'Sofas', itemName: 'Double Seat', pricePence: 37500 },
  { category: 'Sofas', itemName: '3 Seater', pricePence: 42500 },

  { category: 'Engines & Vehicles', itemName: 'Small Car Engine', pricePence: 35000 },
  { category: 'Engines & Vehicles', itemName: '4x4 SUV Engine', pricePence: 60000 },
  { category: 'Engines & Vehicles', itemName: 'Van / Truck Engine', pricePence: 80000 },

  { category: 'Motor Vehicles Shipping', itemName: 'Small Cars', pricePence: 150000 },
  { category: 'Motor Vehicles Shipping', itemName: '4x4 SUVs', pricePence: 200000 },
  { category: 'Motor Vehicles Shipping', itemName: 'Vans / Trucks', pricePence: 350000 },
];
