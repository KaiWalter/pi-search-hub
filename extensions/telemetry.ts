/**
 * Privacy-minimized, append-only web-search observability.
 *
 * Events intentionally contain no query text, URLs, result titles, credentials,
 * or error bodies.  The weekly operations report consumes these aggregate-safe
 * execution records directly.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BackendConfig, SearchConfig } from "./types.js";

export type SearchAttemptTelemetry = {
	backend: string;
	outcome: "success" | "empty" | "error";
	resultCount: number;
	latencyMs: number;
	quotaLimit?: number;
	quotaWarningAt?: number;
};

export type SearchExecutionTelemetry = {
	schemaVersion: 1;
	event: "search_execution";
	ts: string;
	mode: "auto-fallback" | "auto-combine" | "auto-targeted-combine" | "specific";
	attempts: SearchAttemptTelemetry[];
	finalProvider?: string;
	resultCount: number;
	outcome: "success" | "empty" | "error";
	fallbackActivated: boolean;
	fallbackPath: string[];
};

function telemetryPath(config: SearchConfig): string {
	const configured = config.telemetry?.path;
	if (configured) return configured.replace(/^~\//, `${process.env.HOME ?? ""}/`);
	return join(process.env.HOME ?? ".", ".pi", "shared", "data", "search-telemetry", "events.jsonl");
}

/** Best-effort logging must never break a search result. */
export function appendSearchTelemetry(config: SearchConfig, event: SearchExecutionTelemetry): void {
	if (config.telemetry?.enabled === false) return;
	try {
		const path = telemetryPath(config);
		mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
		appendFileSync(path, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
	} catch (error) {
		console.warn(`search-hub: telemetry write failed: ${(error as Error).message}`);
	}
}

export function quotaMetadata(config: SearchConfig, backend: string): Pick<SearchAttemptTelemetry, "quotaLimit" | "quotaWarningAt"> {
	const backendConfig = config.backends?.[backend] as BackendConfig | undefined;
	const quotaLimit = backendConfig?.monthlyQuota;
	const quotaWarningAt = backendConfig?.quotaWarningAt;
	return {
		...(Number.isFinite(quotaLimit) ? { quotaLimit } : {}),
		...(Number.isFinite(quotaWarningAt) ? { quotaWarningAt } : {}),
	};
}
