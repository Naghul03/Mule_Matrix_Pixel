from typing import List
from backend.app.detection.rules import (
    DetectionRule,
    PassThroughVelocityRule,
    FanInFanOutRule,
    VelocityBurstRule,
    SmallRetentionRule,
    RapidDispersalRule
)

def get_detector_rules(version: str) -> List[DetectionRule]:
    """
    Returns rules registered for a given version.
    v1_baseline: only classic velocity burst and fan-in/fan-out
    v2_candidate_matrix: full multi-signal split/merge/retention aware detection
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
            FanInFanOutRule(),
            VelocityBurstRule()
        ]
