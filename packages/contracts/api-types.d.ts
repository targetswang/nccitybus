// Generated from docs/openapi.json by scripts/generate-types.mjs. Do not edit.
export type ApiErrorEnvelope = {
  "error": {
  "code": string;
  "message": string;
  "requestId": string;
};
};

export type GeoPoint = {
  "lat": number;
  "lng": number;
  "crs": "WGS84" | "GCJ02";
};

export type StopOccurrence = {
  "id": string;
  "code": string;
  "name"?: string;
  "sequence": number;
  "tourismNodeId"?: string | null;
  "rawPoint": GeoPoint;
  "mapPoint": GeoPoint | null;
};

export type TransitBranch = {
  "code": string;
  "externalId"?: string;
  "direction": "upward" | "downward";
  "circular"?: boolean;
  "stops": Array<StopOccurrence>;
  "track": Array<GeoPoint>;
  "mapTrack": Array<GeoPoint>;
};

export type TransitRoute = {
  "id": string;
  "name": string;
  "lineCode": string;
  "externalId"?: string;
  "operatorId"?: string;
  "branches": Array<TransitBranch>;
};

export type PublicVehicle = {
  "id": string;
  "label": string;
  "lineCode"?: string;
  "branchCode"?: string;
  "direction"?: string;
  "mapPoint": GeoPoint | null;
  "locatedAt": number;
  "publishedAt": number;
  "receivedAt": number;
  "freshness": "no_data" | "fresh" | "stale" | "unavailable";
  "operationState": "unknown";
  "speed"?: number | null;
  "azimuth"?: number | null;
  "lastStop"?: Record<string, unknown> | null;
  "etaMinutes": null;
};

export type LiveSnapshot = {
  "schemaVersion": "v1";
  "routeVersion": string | null;
  "route": TransitRoute | null;
  "integration": {
  "state": "not_configured" | "connecting" | "connected" | "error" | "stopped";
  "reason"?: string | null;
};
  "freshness": "no_data" | "fresh" | "stale" | "unavailable";
  "vehicles": Array<PublicVehicle>;
  "serverTime": number;
  "thresholds": {
  "freshMs": number;
  "staleMs": number;
};
};

export type Arrivals = {
  "schemaVersion"?: "v1";
  "routeVersion"?: string | null;
  "stationCode"?: string;
  "items"?: Array<{
  "vehicleId"?: string;
  "label"?: string;
  "remainingStops"?: number;
  "etaMinutes"?: null;
  "evidence"?: "vehicle_stop";
  "observedAt"?: number;
}>;
  "serverTime"?: number;
};

export type Poi = {
  "id": string;
  "nodeId": string;
  "name": string;
  "category"?: "吃什么" | "喝什么" | "看什么" | "玩什么" | "休息";
  "subcategory"?: string;
  "address"?: string;
  "description": string;
  "mapPoint": GeoPoint | null;
  "cover": string | null;
  "audioUrl"?: string | null;
  "narration"?: string | null;
  "openingHours"?: string | null;
  "priceAdvice"?: string | null;
};

export type WalkStep = {
  "nodeId": string;
  "poiId"?: string;
  "title": string;
  "stay"?: string;
  "walkHint"?: string;
  "intro": string;
  "localTip": string;
  "narration": string;
  "audioUrl"?: string | null;
};

export type Walk = {
  "id": string;
  "title": string;
  "subtitle"?: string;
  "duration"?: string;
  "bestTime"?: string;
  "audience"?: string;
  "story": string;
  "routeLine"?: string;
  "coverPoiId": string;
  "tags"?: Array<string>;
  "practical": Array<string>;
  "steps": Array<WalkStep>;
};

export type ContentSnapshot = {
  "version": string;
  "publication"?: string;
  "routeId"?: string;
  "title"?: string;
  "nodes": Array<{
  "id"?: string;
  "name"?: string;
  "persona"?: string;
  "mapPoint"?: GeoPoint | null;
}>;
  "pois": Array<Poi>;
  "walks": Array<Walk>;
  "guides"?: Array<Record<string, unknown>>;
  "privacy"?: string;
  "membershipPlans"?: Array<{
  "id": string;
  "availability": "active" | "cancelled" | "upcoming" | "expired" | "disabled" | "full";
  "availabilityReason": string;
}>;
  "benefits"?: Array<{
  "id": string;
  "availability": "active" | "cancelled" | "upcoming" | "expired" | "disabled" | "full";
  "availabilityReason": string;
}>;
  "events"?: Array<{
  "id": string;
  "availability": "active" | "cancelled" | "upcoming" | "expired" | "disabled" | "full";
  "availabilityReason": string;
}>;
};
