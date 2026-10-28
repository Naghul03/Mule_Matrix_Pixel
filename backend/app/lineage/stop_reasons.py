from enum import Enum

class LineageStopReason(str, Enum):
    OFF_RAMP_REACHED = "OFF_RAMP_REACHED"
    NO_ELIGIBLE_INCOMING_OR_OUTGOING_TRANSACTIONS = "NO_ELIGIBLE_INCOMING_OR_OUTGOING_TRANSACTIONS"
    LOOKBACK_OR_LOOKAHEAD_WINDOW_EXCEEDED = "LOOKBACK_OR_LOOKAHEAD_WINDOW_EXCEEDED"
    MAX_HOPS_REACHED = "MAX_HOPS_REACHED"
    MAX_NODES_OR_EDGES_REACHED = "MAX_NODES_OR_EDGES_REACHED"
    MISSING_OR_CONFLICTING_DATA = "MISSING_OR_CONFLICTING_DATA"
    AMBIGUOUS_AMOUNT_ATTRIBUTION = "AMBIGUOUS_AMOUNT_ATTRIBUTION"
    INVESTIGATION_CANCELLED = "INVESTIGATION_CANCELLED"

STOP_REASON_DESCRIPTIONS = {
    LineageStopReason.OFF_RAMP_REACHED: "Traversal reached a recognized terminal off-ramp (e.g. ATM cash withdrawal or external rail exit).",
    LineageStopReason.NO_ELIGIBLE_INCOMING_OR_OUTGOING_TRANSACTIONS: "Trace ended; no further eligible settled transactions were observed within the simulation boundary.",
    LineageStopReason.LOOKBACK_OR_LOOKAHEAD_WINDOW_EXCEEDED: "Traversal halted at the temporal horizon (lookback/lookahead window boundary).",
    LineageStopReason.MAX_HOPS_REACHED: "Traversal reached the configured maximum hop depth budget.",
    LineageStopReason.MAX_NODES_OR_EDGES_REACHED: "Traversal budget limit reached to prevent graph explosion on high-degree nodes.",
    LineageStopReason.MISSING_OR_CONFLICTING_DATA: "Trace encountered incomplete synthetic data or unresolved account identity.",
    LineageStopReason.AMBIGUOUS_AMOUNT_ATTRIBUTION: "Attribution confidence dropped below threshold due to extensive co-mingled flows.",
    LineageStopReason.INVESTIGATION_CANCELLED: "Investigation was manually cancelled by the investigator."
}
