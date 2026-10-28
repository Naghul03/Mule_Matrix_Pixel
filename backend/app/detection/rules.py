from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from backend.app.models.models import Account, Transaction

@dataclass
class RuleSignal:
    rule_code: str
    rule_name: str
    observed_value: str
    threshold: str
    explanation: str
    score_contribution: float
    related_transaction_ids: List[str] = field(default_factory=list)

class DetectionRule:
    rule_code: str
    rule_name: str
    
    def evaluate(self, account: Account, transactions: List[Transaction], config: Dict[str, Any]) -> Optional[RuleSignal]:
        raise NotImplementedError

class PassThroughVelocityRule(DetectionRule):
    rule_code = "PASS_THROUGH_VELOCITY"
    rule_name = "Rapid Pass-Through Ratio"

    def evaluate(self, account: Account, transactions: List[Transaction], config: Dict[str, Any]) -> Optional[RuleSignal]:
        window_minutes = config.get("pass_through_window_minutes", 60)
        threshold_ratio = config.get("pass_through_ratio_threshold", 0.85)

        posted_txs = [t for t in transactions if t.status == "POSTED" and t.posted_at]
        if not posted_txs:
            return None

        # Look at inbound transfers
        inbound = [t for t in posted_txs if t.destination_account_id == account.id]
        outbound = [t for t in posted_txs if t.source_account_id == account.id]

        if not inbound or not outbound:
            return None

        # Check for matching inbound-outbound pairs within window
        for in_tx in inbound:
            in_time = in_tx.posted_at
            window_end = in_time + timedelta(minutes=window_minutes)
            
            subsequent_out = [
                out for out in outbound 
                if in_time <= out.posted_at <= window_end
            ]
            if not subsequent_out:
                continue

            total_out = sum(out.amount_minor for out in subsequent_out)
            ratio = total_out / in_tx.amount_minor if in_tx.amount_minor > 0 else 0

            if ratio >= threshold_ratio and in_tx.amount_minor >= 1000000: # >= ₹10,000
                obs = f"{ratio * 100:.1f}% forwarded (In: ₹{in_tx.amount_minor / 100:,.2f}, Out: ₹{total_out / 100:,.2f})"
                thresh = f">= {threshold_ratio * 100:.0f}% within {window_minutes} mins"
                related = [in_tx.id] + [o.id for o in subsequent_out]
                
                return RuleSignal(
                    rule_code=self.rule_code,
                    rule_name=self.rule_name,
                    observed_value=obs,
                    threshold=thresh,
                    explanation=f"Account received ₹{in_tx.amount_minor / 100:,.2f} and rapidly forwarded {ratio * 100:.1f}% within {window_minutes} minutes, exhibiting classic transit pass-through behavior.",
                    score_contribution=40.0,
                    related_transaction_ids=related
                )
        return None

class FanInFanOutRule(DetectionRule):
    rule_code = "FAN_IN_FAN_OUT"
    rule_name = "Fan-In / Fan-Out Divergence"

    def evaluate(self, account: Account, transactions: List[Transaction], config: Dict[str, Any]) -> Optional[RuleSignal]:
        min_in = config.get("fan_in_min_counterparties", 4)
        min_out = config.get("fan_out_min_counterparties", 3)
        
        # Don't flag merchants or corporates that legitimately aggregate
        if account.account_type in ["MERCHANT", "CORPORATE"]:
            return None

        posted_txs = [t for t in transactions if t.status == "POSTED"]
        inbound = [t for t in posted_txs if t.destination_account_id == account.id]
        outbound = [t for t in posted_txs if t.source_account_id == account.id]

        unique_senders = set(t.source_account_id for t in inbound)
        unique_recipients = set(t.destination_account_id for t in outbound)

        if len(unique_senders) >= min_in and len(unique_recipients) >= min_out:
            related = [t.id for t in inbound] + [t.id for t in outbound]
            return RuleSignal(
                rule_code=self.rule_code,
                rule_name=self.rule_name,
                observed_value=f"In: {len(unique_senders)} sources, Out: {len(unique_recipients)} destinations",
                threshold=f">= {min_in} senders and >= {min_out} recipients",
                explanation=f"High counterparty dispersion: account funneled funds from {len(unique_senders)} separate accounts to {len(unique_recipients)} distinct destinations.",
                score_contribution=35.0,
                related_transaction_ids=related[:15]
            )
        return None

class VelocityBurstRule(DetectionRule):
    rule_code = "VELOCITY_BURST"
    rule_name = "Sudden Velocity Burst"

    def evaluate(self, account: Account, transactions: List[Transaction], config: Dict[str, Any]) -> Optional[RuleSignal]:
        burst_count = config.get("velocity_burst_count", 5)
        window_minutes = config.get("velocity_burst_window_minutes", 30)

        posted_txs = sorted([t for t in transactions if t.status == "POSTED" and t.posted_at], key=lambda x: x.posted_at)
        if len(posted_txs) < burst_count:
            return None

        # Sliding window check
        for i in range(len(posted_txs) - burst_count + 1):
            window_txs = posted_txs[i:i + burst_count]
            time_delta = (window_txs[-1].posted_at - window_txs[0].posted_at).total_seconds() / 60.0
            if time_delta <= window_minutes:
                total_val = sum(t.amount_minor for t in window_txs)
                related = [t.id for t in window_txs]
                return RuleSignal(
                    rule_code=self.rule_code,
                    rule_name=self.rule_name,
                    observed_value=f"{burst_count} transfers in {time_delta:.1f} mins (₹{total_val / 100:,.2f})",
                    threshold=f">= {burst_count} transfers in <= {window_minutes} mins",
                    explanation=f"Transaction frequency spike: {burst_count} transfers executed in {time_delta:.1f} minutes, exceeding normal individual account tempo.",
                    score_contribution=30.0,
                    related_transaction_ids=related
                )
        return None

class SmallRetentionRule(DetectionRule):
    rule_code = "SMALL_RETENTION"
    rule_name = "Mule Commission Retention"

    def evaluate(self, account: Account, transactions: List[Transaction], config: Dict[str, Any]) -> Optional[RuleSignal]:
        min_pct = config.get("retention_min_pct", 0.01)
        max_pct = config.get("retention_max_pct", 0.15)

        posted_txs = [t for t in transactions if t.status == "POSTED" and t.posted_at]
        inbound = [t for t in posted_txs if t.destination_account_id == account.id]
        outbound = [t for t in posted_txs if t.source_account_id == account.id]

        for in_tx in inbound:
            # Check subsequent outbound transfers within 2 hours
            matching_out = [
                o for o in outbound 
                if in_tx.posted_at <= o.posted_at <= in_tx.posted_at + timedelta(hours=2)
            ]
            if not matching_out:
                continue

            total_out = sum(o.amount_minor for o in matching_out)
            retained = in_tx.amount_minor - total_out
            if in_tx.amount_minor > 0 and 0 < retained < in_tx.amount_minor:
                pct = retained / in_tx.amount_minor
                if min_pct <= pct <= max_pct:
                    return RuleSignal(
                        rule_code=self.rule_code,
                        rule_name=self.rule_name,
                        observed_value=f"{pct * 100:.1f}% retained (₹{retained / 100:,.2f} of ₹{in_tx.amount_minor / 100:,.2f})",
                        threshold=f"Between {min_pct * 100:.0f}% and {max_pct * 100:.0f}% retained",
                        explanation=f"Account consistently forwards the vast majority of funds while skimming a fixed cut of {pct * 100:.1f}%, characteristic of mule operator commission.",
                        score_contribution=35.0,
                        related_transaction_ids=[in_tx.id] + [o.id for o in matching_out]
                    )
        return None

class RapidDispersalRule(DetectionRule):
    rule_code = "RAPID_DISPERSAL"
    rule_name = "Immediate Liquidation / Smurfing"

    def evaluate(self, account: Account, transactions: List[Transaction], config: Dict[str, Any]) -> Optional[RuleSignal]:
        posted_txs = [t for t in transactions if t.status == "POSTED" and t.posted_at]
        inbound = [t for t in posted_txs if t.destination_account_id == account.id]
        outbound = [t for t in posted_txs if t.source_account_id == account.id]

        for in_tx in inbound:
            immediate_out = [
                o for o in outbound 
                if in_tx.posted_at <= o.posted_at <= in_tx.posted_at + timedelta(minutes=15)
            ]
            if len(immediate_out) >= 2: # Split immediately into 2+ branches
                out_sum = sum(o.amount_minor for o in immediate_out)
                if out_sum >= in_tx.amount_minor * 0.90:
                    return RuleSignal(
                        rule_code=self.rule_code,
                        rule_name=self.rule_name,
                        observed_value=f"Dispersed to {len(immediate_out)} destinations within 15m (₹{out_sum / 100:,.2f})",
                        threshold=f">= 2 splits dispersing >= 90% in <= 15 mins",
                        explanation=f"Immediate split liquidation: funds were divided across {len(immediate_out)} downstream accounts within minutes of receipt.",
                        score_contribution=35.0,
                        related_transaction_ids=[in_tx.id] + [o.id for o in immediate_out]
                    )
        return None
