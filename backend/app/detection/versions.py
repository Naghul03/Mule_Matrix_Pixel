from typing import List
from backend.app.detection.rules import (
    DetectionRule,
    PassThroughVelocityRule,
    FanInFanOutRule,
    VelocityBurstRule,
    SmallRetentionRule,
    RapidDispersalRule,
    CrossBankHopRule,
    HighRiskLinkRule,
    RepeatedOffRampRule,
    LowAndSlowRule
)

def get_detector_rules(version: str) -> List[DetectionRule]:
    """
    Returns rules registered for a given version.
    v1_baseline: only classic velocity burst and fan-in/fan-out
    v2_candidate_matrix: full multi-signal split/merge/cross-bank/retention/low-and-slow aware detection
    """
    if version == "v1_baseline":
        return [
            VelocityBurstRule(),
            FanInFanOutRule()
        ]
    else: # v2_candidate_matrix (default)
        return [
            PassThroughVelocityRule(),
            SmallRetentionRule(),
            RapidDispersalRule(),
            CrossBankHopRule(),
            RepeatedOffRampRule(),
            LowAndSlowRule(),
            HighRiskLinkRule(),
            FanInFanOutRule(),
            VelocityBurstRule()
        ]
