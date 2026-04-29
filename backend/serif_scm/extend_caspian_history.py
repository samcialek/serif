"""Extend Caspian R's daily fitting rows across the weather history window.

The Bayesian user-observation fitter consumes backend/output/lifestyle_app.csv
and backend/output/wearables_daily.csv. Caspian's demo payload originally had
only the first program window there, even though we now have years of
location-aware weather context. This module adds a deterministic, model-derived
daily history for participant 1 so per-edge user observations can be fit over
years rather than a few dozen matched rows.

Existing participant-1 rows are preserved exactly where they already exist.
Only missing days and days beyond the original program window are filled.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd


PID = 1
SEED = 20260425


def _clip(v: float, lo: float, hi: float) -> float:
    return float(min(hi, max(lo, v)))


def _replace_pid_rows(
    df: pd.DataFrame,
    new_rows: pd.DataFrame,
    columns: list[str],
    sort_cols: list[str],
) -> pd.DataFrame:
    kept = df[df["participant_id"] != PID].copy()
    out = pd.concat([new_rows[columns], kept[columns]], ignore_index=True)
    return out.sort_values(sort_cols).reset_index(drop=True)


def _weather_penalties(row: pd.Series) -> tuple[float, float, float]:
    temp = float(row["temp_c"])
    heat = float(row["heat_index_c"])
    aqi = float(row["aqi"]) if pd.notna(row.get("aqi")) else 45.0
    humidity = float(row["humidity_pct"]) if pd.notna(row.get("humidity_pct")) else 60.0

    cold_penalty = max(0.0, 8.0 - temp)
    heat_penalty = max(0.0, heat - 27.0)
    air_penalty = max(0.0, aqi - 55.0) / 25.0
    humidity_penalty = max(0.0, humidity - 70.0) / 20.0
    return cold_penalty, heat_penalty, air_penalty + 0.25 * humidity_penalty


def build_caspian_rows(
    weather: pd.DataFrame,
    life_existing: pd.DataFrame,
    wear_existing: pd.DataFrame,
    adherence_existing: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(SEED)
    weather = weather.copy()
    weather["date"] = pd.to_datetime(weather["date"])
    weather["day"] = np.arange(1, len(weather) + 1)

    existing_life = {
        int(row["day"]): row
        for _, row in life_existing[life_existing["participant_id"] == PID].iterrows()
    }
    existing_wear = {
        int(row["day"]): row
        for _, row in wear_existing[wear_existing["participant_id"] == PID].iterrows()
    }
    existing_adherence = {
        int(row["day"]): row
        for _, row in adherence_existing[adherence_existing["participant_id"] == PID].iterrows()
    }

    life_pid = life_existing[life_existing["participant_id"] == PID]
    wear_pid = wear_existing[wear_existing["participant_id"] == PID]
    cohort = str(wear_pid["cohort"].iloc[0]) if len(wear_pid) else "delhi"

    base_steps = float(life_pid["steps"].mean()) if "steps" in life_pid else 9300.0
    base_sleep = float(life_pid["sleep_hrs"].mean()) if "sleep_hrs" in life_pid else 7.2
    base_bed = float(life_pid["bedtime_hr"].mean()) if "bedtime_hr" in life_pid else 23.0
    base_training = float(life_pid["training_min"].mean()) if "training_min" in life_pid else 35.0
    base_run = float(life_pid["run_km"].mean()) if "run_km" in life_pid else 6.5
    base_zone2 = float(life_pid["zone2_min"].mean()) if "zone2_min" in life_pid else 24.0
    base_protein = float(life_pid["protein_g"].mean()) if "protein_g" in life_pid else 92.0
    base_energy = float(life_pid["energy_kcal"].mean()) if "energy_kcal" in life_pid else 2350.0

    base_hrv = float(wear_pid["hrv_daily"].mean()) if "hrv_daily" in wear_pid else 48.0
    base_rhr = float(wear_pid["resting_hr"].mean()) if "resting_hr" in wear_pid else 59.0
    base_eff = float(wear_pid["sleep_efficiency"].mean()) if "sleep_efficiency" in wear_pid else 84.0
    base_quality = float(wear_pid["sleep_quality"].mean()) if "sleep_quality" in wear_pid else 67.0
    base_deep = float(wear_pid["deep_sleep"].mean()) if "deep_sleep" in wear_pid else 108.0

    sleep_hist: list[float] = []
    training_hist: list[float] = []
    hrv_prev = base_hrv
    rhr_prev = base_rhr
    quality_prev = base_quality

    life_rows: list[dict] = []
    wear_rows: list[dict] = []
    adherence_rows: list[dict] = []

    for _, w in weather.iterrows():
        day = int(w["day"])
        date = w["date"]
        dow = int(date.dayofweek)
        weekend = dow >= 5
        doy = int(date.dayofyear)
        annual = np.sin(2 * np.pi * (doy - 172) / 365.25)
        training_block = np.sin(2 * np.pi * day / 56.0)
        travel_shift = 1.0 if str(w.get("location_id")) == "tel_aviv" else 0.0
        cold_penalty, heat_penalty, air_penalty = _weather_penalties(w)

        if day in existing_life:
            old = existing_life[day]
            life_row = {
                "participant_id": PID,
                "day": day,
                "run_km": float(old["run_km"]),
                "training_min": int(round(float(old["training_min"]))),
                "zone2_min": int(round(float(old["zone2_min"]))),
                "steps": int(round(float(old["steps"]))),
                "sleep_hrs": float(old["sleep_hrs"]),
                "bedtime_hr": float(old["bedtime_hr"]),
                "protein_g": int(round(float(old["protein_g"]))),
                "energy_kcal": int(round(float(old["energy_kcal"]))),
            }
        else:
            training_min = (
                base_training
                + 6.0 * training_block
                + (5.0 if dow in (1, 3, 5) else -3.5)
                - 0.7 * cold_penalty
                - 0.9 * heat_penalty
                - 2.4 * air_penalty
                + rng.normal(0, 5.0)
            )
            training_min = _clip(training_min, 8.0, 82.0)
            run_km = (
                base_run
                + 0.07 * (training_min - base_training)
                + 0.55 * training_block
                - 0.08 * cold_penalty
                - 0.10 * heat_penalty
                - 0.22 * air_penalty
                + rng.normal(0, 0.7)
            )
            run_km = _clip(run_km, 1.8, 12.0)
            zone2_min = _clip(base_zone2 + 0.55 * (training_min - base_training) + rng.normal(0, 3.5), 6, training_min)
            steps = (
                base_steps
                + 460 * annual
                + (850 if weekend else 0)
                + 34 * (training_min - base_training)
                - 85 * cold_penalty
                - 105 * heat_penalty
                - 240 * air_penalty
                + rng.normal(0, 900)
            )
            steps = _clip(steps, 4200, 16800)
            bedtime = (
                base_bed
                + (0.35 if weekend else 0.0)
                + 0.22 * travel_shift
                + 0.10 * training_block
                + rng.normal(0, 0.22)
            )
            bedtime = _clip(bedtime, 21.4, 24.7)
            sleep_hrs = (
                base_sleep
                + (0.18 if weekend else -0.04)
                - 0.045 * max(0.0, bedtime - 23.0)
                - 0.035 * heat_penalty
                - 0.020 * cold_penalty
                - 0.035 * air_penalty
                + rng.normal(0, 0.28)
            )
            sleep_hrs = _clip(sleep_hrs, 5.7, 8.6)
            protein_g = _clip(base_protein + 0.35 * (training_min - base_training) + rng.normal(0, 9), 62, 145)
            energy_kcal = _clip(base_energy + 4.2 * (steps - base_steps) / 10 + 5.0 * (training_min - base_training) + rng.normal(0, 170), 1850, 3350)

            life_row = {
                "participant_id": PID,
                "day": day,
                "run_km": round(run_km, 1),
                "training_min": int(round(training_min)),
                "zone2_min": int(round(zone2_min)),
                "steps": int(round(steps)),
                "sleep_hrs": round(sleep_hrs, 1),
                "bedtime_hr": round(bedtime, 1),
                "protein_g": int(round(protein_g)),
                "energy_kcal": int(round(energy_kcal)),
            }

        sleep_debt = sum(max(0.0, 7.5 - s) for s in sleep_hist[-14:])
        training_load = float(life_row["training_min"]) * 1.78
        weekly_training = np.mean(training_hist[-7:]) if training_hist else base_training
        bedtime_dev = abs(float(life_row["bedtime_hr"]) - 22.8)
        sleep_dev = float(life_row["sleep_hrs"]) - base_sleep
        steps_dev = (float(life_row["steps"]) - base_steps) / 1000.0
        training_dev = float(life_row["training_min"]) - base_training

        if day in existing_wear:
            old = existing_wear[day]
            wear_row = {
                "participant_id": PID,
                "cohort": cohort,
                "day": day,
                "hrv_daily": float(old["hrv_daily"]),
                "resting_hr": float(old["resting_hr"]),
                "sleep_efficiency": float(old["sleep_efficiency"]),
                "sleep_quality": float(old["sleep_quality"]),
                "deep_sleep": float(old["deep_sleep"]),
                "sleep_hrs": float(old["sleep_hrs"]),
                "steps": int(round(float(old["steps"]))),
            }
        else:
            hrv_target = (
                base_hrv
                + 1.65 * sleep_dev
                + 0.11 * steps_dev
                - 0.030 * training_dev
                - 0.016 * max(0.0, weekly_training - base_training)
                - 0.12 * sleep_debt
                - 0.10 * heat_penalty
                - 0.06 * cold_penalty
                - 0.32 * air_penalty
                + rng.normal(0, 1.15)
            )
            rhr_target = (
                base_rhr
                - 0.32 * sleep_dev
                - 0.04 * steps_dev
                + 0.018 * training_dev
                + 0.040 * max(0.0, weekly_training - base_training)
                + 0.08 * sleep_debt
                + 0.06 * heat_penalty
                + 0.03 * cold_penalty
                + 0.14 * air_penalty
                + rng.normal(0, 0.55)
            )
            eff = (
                base_eff
                + 1.6 * sleep_dev
                - 1.05 * bedtime_dev
                - 0.10 * sleep_debt
                - 0.10 * heat_penalty
                - 0.04 * cold_penalty
                + rng.normal(0, 0.85)
            )
            quality_target = (
                base_quality
                + 4.4 * sleep_dev
                - 1.7 * bedtime_dev
                - 0.030 * max(0.0, training_dev)
                - 0.34 * sleep_debt
                - 0.18 * heat_penalty
                - 0.08 * cold_penalty
                - 0.28 * air_penalty
                + rng.normal(0, 1.8)
            )
            deep = (
                base_deep
                + 8.5 * sleep_dev
                - 2.0 * bedtime_dev
                - 0.070 * max(0.0, training_dev)
                - 0.85 * sleep_debt
                - 0.35 * heat_penalty
                - 0.15 * air_penalty
                + rng.normal(0, 4.8)
            )

            hrv_prev = 0.72 * hrv_prev + 0.28 * hrv_target
            rhr_prev = 0.70 * rhr_prev + 0.30 * rhr_target
            quality_prev = 0.55 * quality_prev + 0.45 * quality_target

            wear_row = {
                "participant_id": PID,
                "cohort": cohort,
                "day": day,
                "hrv_daily": round(_clip(hrv_prev, 34, 65), 1),
                "resting_hr": round(_clip(rhr_prev, 48, 72), 1),
                "sleep_efficiency": round(_clip(eff, 76, 93), 1),
                "sleep_quality": round(_clip(quality_prev, 50, 84), 1),
                "deep_sleep": round(_clip(deep, 66, 142), 1),
                "sleep_hrs": float(life_row["sleep_hrs"]),
                "steps": int(round(float(life_row["steps"]) + rng.normal(0, 180))),
            }

        if day in existing_adherence:
            old = existing_adherence[day]
            adherence_score = float(old["adherence_score"])
            adherence_cohort = str(old["cohort"])
        else:
            adherence_score = _clip(0.82 - 0.015 * air_penalty - 0.010 * heat_penalty + rng.normal(0, 0.055), 0.55, 0.96)
            adherence_cohort = cohort

        life_rows.append(life_row)
        wear_rows.append(wear_row)
        adherence_rows.append({
            "participant_id": PID,
            "day": day,
            "adherence_score": round(adherence_score, 3),
            "cohort": adherence_cohort,
        })

        sleep_hist.append(float(life_row["sleep_hrs"]))
        training_hist.append(training_load)
        hrv_prev = float(wear_row["hrv_daily"])
        rhr_prev = float(wear_row["resting_hr"])
        quality_prev = float(wear_row["sleep_quality"])

    return pd.DataFrame(life_rows), pd.DataFrame(wear_rows), pd.DataFrame(adherence_rows)


def extend_history(data_dir: Path, weather_path: Path) -> None:
    life_path = data_dir / "lifestyle_app.csv"
    wear_path = data_dir / "wearables_daily.csv"
    adherence_path = data_dir / "adherence.csv"

    life = pd.read_csv(life_path)
    wear = pd.read_csv(wear_path)
    adherence = pd.read_csv(adherence_path)
    weather = pd.read_csv(weather_path)

    life_new, wear_new, adherence_new = build_caspian_rows(weather, life, wear, adherence)

    life_cols = ["participant_id", "day", "run_km", "training_min", "zone2_min", "steps", "sleep_hrs", "bedtime_hr", "protein_g", "energy_kcal"]
    wear_cols = ["participant_id", "cohort", "day", "hrv_daily", "resting_hr", "sleep_efficiency", "sleep_quality", "deep_sleep", "sleep_hrs", "steps"]
    adherence_cols = ["participant_id", "day", "adherence_score", "cohort"]

    _replace_pid_rows(life, life_new, life_cols, ["participant_id", "day"]).to_csv(life_path, index=False)
    _replace_pid_rows(wear, wear_new, wear_cols, ["participant_id", "day"]).to_csv(wear_path, index=False)
    _replace_pid_rows(adherence, adherence_new, adherence_cols, ["participant_id", "day"]).to_csv(adherence_path, index=False)

    print(
        f"[caspian-history] wrote {len(life_new)} lifestyle rows, "
        f"{len(wear_new)} wearable rows, {len(adherence_new)} adherence rows "
        f"for participant {PID}"
    )


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser(description="Extend Caspian R daily fitting rows")
    ap.add_argument("--data-dir", default=str(root / "output"))
    ap.add_argument("--weather", default=str(root / "data" / "caspian_weather.csv"))
    args = ap.parse_args()
    extend_history(Path(args.data_dir), Path(args.weather))


if __name__ == "__main__":
    main()
