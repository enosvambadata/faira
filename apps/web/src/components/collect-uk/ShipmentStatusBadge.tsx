import { StatusBadge } from "@/components/ui/StatusBadge";
import { CollectUkShipmentStatus } from "@/lib/api";

const STATUS_TONE: Record<CollectUkShipmentStatus, "neutral" | "info" | "success" | "error"> = {
  PREPARING: "neutral",
  IN_TRANSIT: "info",
  ARRIVED: "success",
  COMPLETED: "success",
  CANCELLED: "error",
};

export const STATUS_LABEL: Record<CollectUkShipmentStatus, string> = {
  PREPARING: "Preparing",
  IN_TRANSIT: "In transit",
  ARRIVED: "Arrived",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const SHIPMENT_STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as CollectUkShipmentStatus[]).map(value => ({
  value,
  label: STATUS_LABEL[value],
}));

export function ShipmentStatusBadge({ status }: { status: CollectUkShipmentStatus }) {
  return <StatusBadge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />;
}
