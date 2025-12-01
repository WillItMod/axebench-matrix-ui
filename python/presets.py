
# AxeBench Presets

PRESETS = [
    {
        "id": "fast",
        "name": "Fast",
        "description": "Quick, coarse tuning sweep with larger steps for faster results.",
        "config": {
            "strategy": "adaptive_progression",
            "coarse_step_multiplier": 3,
            "refinement_range": 1
        }
    },
    {
        "id": "balanced",
        "name": "Balanced",
        "description": "Default mode. Reasonable scan detail with adaptive narrowing steps.",
        "config": {
            "strategy": "adaptive_progression",
            "coarse_step_multiplier": 2,
            "refinement_range": 2
        }
    },
    {
        "id": "nerd",
        "name": "NERD Mode",
        "description": "Highly detailed scan using finer steps and more samples.",
        "config": {
            "strategy": "adaptive_progression",
            "coarse_step_multiplier": 1,
            "refinement_range": 3
        }
    }
]

# Default preset
DEFAULT_PRESET_ID = "balanced"

def get_preset_by_id(preset_id):
    return next((p for p in PRESETS if p["id"] == preset_id), None)
