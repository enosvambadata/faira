import { CollectUkItemType, CollectUkVehicleType } from "./api";

export const ITEM_TYPE_LABELS: Record<CollectUkItemType, string> = {
  DRUM: "Drum(s)",
  SUITCASE: "Suitcase(s)",
  FRIDGE: "Fridge",
  STOVE: "Stove",
  PALLET: "Goods strapped on a pallet",
  VEHICLE: "Vehicle",
  OTHER: "Other",
};

export const VEHICLE_TYPE_LABELS: Record<CollectUkVehicleType, string> = {
  SEDAN: "Car — Sedan",
  SUV: "Car — SUV",
  TRUCK: "Truck",
};

// One human-readable line for dashboards, driver stop cards, and parcel
// labels: "Drum(s), Fridge, Vehicle (Car — SUV), Other: kitchen unit".
export function describeItems(
  itemTypes: CollectUkItemType[],
  itemTypeOther: string | null,
  vehicleType: CollectUkVehicleType | null,
): string {
  return itemTypes
    .map(type => {
      if (type === "VEHICLE" && vehicleType) return `Vehicle (${VEHICLE_TYPE_LABELS[vehicleType]})`;
      if (type === "OTHER" && itemTypeOther) return `Other: ${itemTypeOther}`;
      return ITEM_TYPE_LABELS[type];
    })
    .join(", ");
}
