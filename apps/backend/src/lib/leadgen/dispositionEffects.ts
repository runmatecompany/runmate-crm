import type { LeadGenDisposition } from "../../db/leadgenCallAttempts.js";
import type { LeadGenStatus } from "../../db/leadgenCompanies.js";

export interface DispositionEffects {
  nextCallAt: string | null;
  leadStatus: LeadGenStatus;
  doNotCall: boolean;
  doNotCallReason?: string;
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function addMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

// A diszpozíciós kódok automatikus hatásai — lásd a specifikáció 8. pontját.
// A callback_requested/gatekeeper_passed/dm_unavailable eseteknél, ha a
// hívó megadott konkrét időpontot (explicitNextCallAt), azt vesszük
// figyelembe a becsült alapérték helyett — a visszahívásnál ez KÖTELEZŐ.
export function computeDispositionEffects(
  disposition: LeadGenDisposition,
  explicitNextCallAt: string | undefined,
  currentLeadStatus: LeadGenStatus
): DispositionEffects {
  switch (disposition) {
    case "no_answer":
    case "busy":
      return { nextCallAt: explicitNextCallAt ?? addDays(1), leadStatus: "calling", doNotCall: false };
    case "wrong_number":
      return { nextCallAt: null, leadStatus: "qualified", doNotCall: false };
    case "gatekeeper_blocked":
      return { nextCallAt: explicitNextCallAt ?? addDays(3), leadStatus: "calling", doNotCall: false };
    case "gatekeeper_passed":
      return { nextCallAt: explicitNextCallAt ?? addDays(1), leadStatus: "calling", doNotCall: false };
    case "dm_unavailable":
      return { nextCallAt: explicitNextCallAt ?? addDays(1), leadStatus: "calling", doNotCall: false };
    case "callback_requested":
      return { nextCallAt: explicitNextCallAt ?? addDays(1), leadStatus: "callback", doNotCall: false };
    case "not_interested":
      return { nextCallAt: addMonths(6), leadStatus: "nurture", doNotCall: false };
    case "interested":
      return { nextCallAt: explicitNextCallAt ?? null, leadStatus: "interested", doNotCall: false };
    case "meeting_booked":
      return { nextCallAt: explicitNextCallAt ?? null, leadStatus: "meeting_booked", doNotCall: false };
    case "do_not_call":
      return {
        nextCallAt: null,
        leadStatus: "lost",
        doNotCall: true,
        doNotCallReason: "Az ügyfél kifejezetten kérte, hogy ne hívjuk",
      };
    default:
      return { nextCallAt: null, leadStatus: currentLeadStatus, doNotCall: false };
  }
}
