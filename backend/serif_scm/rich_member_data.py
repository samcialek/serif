"""Rich longitudinal member tables for the Sarah M. demo participant.

This module writes canonical backend CSVs for dense multi-year streams and
also replaces participant 3 in the core pipeline tables so Bayesian exports
derive Sarah's posteriors from the same files used by the rest of the engine.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from .synthetic.config import BIOMARKER_PRIORS


SARAH_PID = 3
SARAH_COHORT = "cohort_b"
SARAH_AGE = 41
SARAH_IS_FEMALE = True
SARAH_START = pd.Timestamp("2018-11-05")
SARAH_END = pd.Timestamp("2026-04-25")


def _clip(value: float, lo: float, hi: float) -> float:
    return float(max(lo, min(hi, value)))


def _round(value: float, digits: int = 2) -> float:
    return float(round(float(value), digits))


def _heat_index_c(temp_c: float, humidity_pct: float) -> float:
    if temp_c < 24:
        return temp_c
    t_f = temp_c * 9 / 5 + 32
    rh = humidity_pct
    hi_f = (
        -42.379
        + 2.04901523 * t_f
        + 10.14333127 * rh
        - 0.22475541 * t_f * rh
        - 0.00683783 * t_f * t_f
        - 0.05481717 * rh * rh
        + 0.00122874 * t_f * t_f * rh
        + 0.00085282 * t_f * rh * rh
        - 0.00000199 * t_f * t_f * rh * rh
    )
    return float((hi_f - 32) * 5 / 9)


def _base_calendar() -> pd.DataFrame:
    dates = pd.date_range(SARAH_START, SARAH_END, freq="D")
    out = pd.DataFrame(
        {
            "participant_id": SARAH_PID,
            "cohort": SARAH_COHORT,
            "day": np.arange(1, len(dates) + 1, dtype=int),
            "date": dates.strftime("%Y-%m-%d"),
            "day_of_year": dates.dayofyear.astype(int),
            "weekday": dates.dayofweek.astype(int),
        }
    )
    return out


def _cycle_frame(base: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    cycle_start = 1
    cycle_index = 0
    cycle_length = 28
    for row in base.itertuples(index=False):
        day = int(row.day)
        if day >= cycle_start + cycle_length:
            cycle_start += cycle_length
            cycle_index += 1
            cycle_length = int(
                _clip(
                    round(28 + math.sin(cycle_index * 1.7) * 1.8 + rng.normal(0, 1.7)),
                    25,
                    34,
                )
            )
        cycle_day = max(1, day - cycle_start + 1)
        luteal = 18 <= cycle_day <= min(cycle_length, 31)
        flow = 0.0
        if cycle_day <= 5:
            flow = _clip(4.2 - abs(cycle_day - 2.5) * 0.9 + rng.normal(0, 0.25), 0, 5)
        symptom = _clip(
            1.4
            + (2.4 if luteal else 0.0)
            + (1.0 if cycle_day <= 3 else 0.0)
            + rng.normal(0, 0.55),
            0,
            8,
        )
        ovulation = math.exp(-((cycle_day - 14) ** 2) / 7.0)
        rows.append(
            {
                "participant_id": SARAH_PID,
                "cohort": SARAH_COHORT,
                "day": day,
                "date": row.date,
                "cycle_day": cycle_day,
                "cycle_length_estimate": cycle_length,
                "cycle_luteal_phase": int(luteal),
                "cycle_phase": "luteal" if luteal else ("menstrual" if cycle_day <= 5 else "follicular"),
                "luteal_symptom_score": _round(symptom, 1),
                "flow_score": _round(flow, 1),
                "ovulation_probability": _round(_clip(ovulation, 0, 1), 3),
            }
        )
    return pd.DataFrame(rows)


def generate_sarah_rich_frames(seed: int = 33441) -> dict[str, pd.DataFrame]:
    rng = np.random.default_rng(seed)
    base = _base_calendar()
    n = len(base)
    progress = np.linspace(0, 1, n)
    season = np.sin(((base["day_of_year"].to_numpy() - 175) / 365.25) * 2 * math.pi)
    weekend = (base["weekday"].to_numpy() >= 5).astype(float)
    cycle = _cycle_frame(base, rng)
    luteal = cycle["cycle_luteal_phase"].to_numpy(dtype=float)
    luteal_symptoms = cycle["luteal_symptom_score"].to_numpy(dtype=float)

    # Sarah is mostly in New York, with periodic Tel Aviv travel blocks.
    travel_block = ((base["day"].to_numpy() % 173) > 142).astype(float)
    tel_aviv = (travel_block * (rng.random(n) > 0.35)).astype(float)
    location = np.where(tel_aviv > 0, "Tel Aviv", "New York")
    temp_c = 15 + 11 * season + tel_aviv * 6 + rng.normal(0, 3.2, n)
    humidity = _clip_array(61 + tel_aviv * 5 - season * 8 + rng.normal(0, 10, n), 32, 92)
    heat_index = np.array([_heat_index_c(float(t), float(h)) for t, h in zip(temp_c, humidity)])
    aqi = _clip_array(42 + tel_aviv * 8 + weekend * 2 + rng.normal(0, 14, n), 12, 115)
    uv_index = _clip_array(3.8 + 2.5 * season + tel_aviv * 1.2 + rng.normal(0, 0.7, n), 0.2, 10)

    stress = _clip_array(38 + 12 * ((base["day"].to_numpy() % 91) > 62) + luteal * 4 + rng.normal(0, 10, n), 5, 95)
    training_min = _clip_array(38 + 8 * np.sin(base["day"].to_numpy() / 19) - luteal * 2 + rng.normal(0, 14, n), 0, 95)
    zone2_min = _clip_array(training_min * (0.38 + rng.normal(0, 0.08, n)), 0, 55)
    run_km = _clip_array(training_min / 18 + rng.normal(0, 1.4, n), 0, 12)
    steps = _clip_array(8200 + zone2_min * 58 + tel_aviv * 950 + rng.normal(0, 1750, n), 1800, 19000)
    active_energy = _clip_array(0.04 * steps + 3.1 * training_min + rng.normal(0, 45, n), 120, 1050)

    late_meal_prob = _clip_array(0.16 + weekend * 0.24 + tel_aviv * 0.18 + stress / 400, 0.02, 0.78)
    late_meal_count = (rng.random(n) < late_meal_prob).astype(int) + (rng.random(n) < late_meal_prob * 0.12).astype(int)
    post_meal_walks = _clip_array(np.round(1 + progress * 1.4 + tel_aviv * 0.5 + rng.normal(0, 0.9, n)), 0, 4)
    fiber_g = _clip_array(18 + progress * 13 + rng.normal(0, 4.8, n), 7, 48)
    carbohydrate_g = _clip_array(202 - progress * 36 + training_min * 0.38 + luteal * 12 + rng.normal(0, 30, n), 75, 330)
    protein_g = _clip_array(82 + progress * 16 + training_min * 0.08 + rng.normal(0, 13, n), 45, 155)
    fat_g = _clip_array(78 - progress * 7 + rng.normal(0, 12, n), 42, 125)
    energy_kcal = _clip_array(protein_g * 4 + carbohydrate_g * 4 + fat_g * 9 + rng.normal(0, 95, n), 1450, 3100)
    sodium_mg = _clip_array(2300 + tel_aviv * 260 + late_meal_count * 300 + rng.normal(0, 420, n), 1100, 5200)
    potassium_mg = _clip_array(2700 + fiber_g * 42 + rng.normal(0, 390, n), 1700, 5200)
    magnesium_mg = _clip_array(230 + fiber_g * 4.8 + rng.normal(0, 40, n), 140, 510)
    zinc_mg_food = _clip_array(8.5 + protein_g * 0.025 + rng.normal(0, 1.4, n), 4, 19)
    iron_mg = _clip_array(10 + fiber_g * 0.08 + rng.normal(0, 1.6, n), 5, 22)
    omega3_g = _clip_array(0.7 + progress * 0.45 + rng.normal(0, 0.35, n), 0.05, 3.2)
    caffeine_mg = _clip_array(120 + stress * 1.1 - progress * 18 + rng.normal(0, 38, n), 0, 320)
    alcohol_g = _clip_array(weekend * rng.gamma(1.3, 7.0, n) + tel_aviv * rng.gamma(1.0, 5.0, n), 0, 42)
    last_meal_hour = _clip_array(19.1 + late_meal_count * 1.35 + tel_aviv * 0.35 + rng.normal(0, 0.7, n), 17.0, 24.2)
    eating_window_hrs = _clip_array(11.5 + late_meal_count * 1.2 + rng.normal(0, 1.0, n), 7.5, 15.5)

    bedroom_temp_c = _clip_array(20.7 + np.maximum(temp_c - 24, 0) * 0.13 + tel_aviv * 0.45 + rng.normal(0, 0.75, n), 17.5, 26.5)
    bedroom_humidity = _clip_array(48 + humidity * 0.17 + rng.normal(0, 5, n), 28, 72)
    bedroom_co2 = _clip_array(650 + late_meal_count * 50 + rng.normal(0, 130, n), 410, 1350)
    bedroom_noise = _clip_array(32 + weekend * 2.5 + tel_aviv * 3 + rng.normal(0, 4.2, n), 22, 58)
    bedroom_light = _clip_array(0.9 + late_meal_count * 0.6 + rng.gamma(1.2, 0.4, n), 0, 8)
    window_open = ((temp_c > 18) & (temp_c < 27) & (aqi < 70) & (rng.random(n) > 0.25)).astype(int)

    supp_melatonin = ((tel_aviv > 0) | (late_meal_count > 1) | (rng.random(n) < 0.045)).astype(int)
    supp_l_theanine = ((stress > 62) & (rng.random(n) < 0.45)).astype(int)
    # Zinc is more frequent while Sarah's zinc status is low early on, then tapers.
    supp_zinc = ((progress < 0.48) & (rng.random(n) < 0.55)).astype(int) | ((progress >= 0.48) & (rng.random(n) < 0.16)).astype(int)
    supp_magnesium = ((rng.random(n) < 0.42) | (luteal > 0)).astype(int)
    supp_creatine = (rng.random(n) < (0.10 + progress * 0.28)).astype(int)

    sleep_hrs = _clip_array(
        7.25
        - late_meal_count * 0.18
        - np.maximum(bedroom_temp_c - 22, 0) * 0.09
        - luteal_symptoms * 0.035
        + supp_melatonin * 0.06
        + rng.normal(0, 0.42, n),
        5.2,
        9.1,
    )
    bedtime_hr = _clip_array(22.35 + late_meal_count * 0.42 + stress / 300 + tel_aviv * 0.28 + rng.normal(0, 0.45, n), 20.4, 24.8)
    sleep_efficiency = _clip_array(
        88.5
        - late_meal_count * 1.25
        - np.maximum(bedroom_temp_c - 22.2, 0) * 1.7
        - np.maximum(19.5 - bedroom_temp_c, 0) * 0.7
        - luteal_symptoms * 0.35
        + supp_melatonin * 0.35
        + supp_l_theanine * 0.18
        + rng.normal(0, 2.2, n),
        70,
        97,
    )
    deep_sleep = _clip_array(
        68
        + (sleep_hrs - 7.2) * 9
        - np.maximum(bedroom_temp_c - 22.2, 0) * 4.8
        - late_meal_count * 2.2
        - luteal * 4
        + supp_zinc * 0.7
        + rng.normal(0, 8.5, n),
        25,
        112,
    )
    hrv_daily = _clip_array(
        47
        + (sleep_efficiency - 86) * 0.72
        - luteal * 2.8
        - alcohol_g * 0.12
        - np.maximum(training_min - 70, 0) * 0.12
        + post_meal_walks * 0.35
        + rng.normal(0, 5.0, n),
        18,
        90,
    )
    resting_hr = _clip_array(62 - (hrv_daily - 45) * 0.11 + luteal * 1.2 + alcohol_g * 0.04 + rng.normal(0, 2.4, n), 45, 82)
    sleep_quality = _clip_array(sleep_efficiency * 0.72 + sleep_hrs * 3.4 + hrv_daily * 0.08 + rng.normal(0, 3.2, n), 35, 98)

    fasting_glucose = _clip_array(
        113
        - progress * 21
        + luteal * 4.1
        + late_meal_count * 4.7
        + (carbohydrate_g - 170) * 0.035
        - (fiber_g - 20) * 0.17
        - post_meal_walks * 1.8
        - (sleep_hrs - 7.0) * 1.2
        + rng.normal(0, 3.3, n),
        76,
        134,
    )
    glucose_mean = _clip_array(fasting_glucose + 9 + carbohydrate_g * 0.055 - fiber_g * 0.08 - post_meal_walks * 1.4 + rng.normal(0, 3.0, n), 86, 156)
    glucose_cv = _clip_array(23 - progress * 7 + luteal * 2.5 + late_meal_count * 1.7 - post_meal_walks * 0.7 + rng.normal(0, 1.8, n), 9, 31)
    postprandial_peak = _clip_array(glucose_mean + 25 + carbohydrate_g * 0.16 - fiber_g * 0.22 - post_meal_walks * 3.7 + rng.normal(0, 6.0, n), 105, 218)
    time_above_140 = _clip_array((postprandial_peak - 135) * 0.45 + late_meal_count * 2.5 + rng.normal(0, 3.2, n), 0, 44)

    body_mass = _clip_array(72.5 - progress * 4.1 + rng.normal(0, 0.9, n), 61, 78)
    body_fat = _clip_array(31.5 - progress * 6.2 + (energy_kcal - 2050) * 0.0015 - fiber_g * 0.018 + rng.normal(0, 0.65, n), 20, 34)

    daily_context = base.assign(
        location=location,
        temp_c=np.round(temp_c, 1),
        humidity_pct=np.round(humidity, 0),
        heat_index_c=np.round(heat_index, 1),
        aqi=np.round(aqi, 0),
        uv_index=np.round(uv_index, 1),
        perceived_stress=np.round(stress, 0),
        illness_flag=(rng.random(n) < 0.018).astype(int),
        travel_load=np.round(tel_aviv * (0.45 + rng.random(n) * 0.45), 2),
    ).merge(cycle.drop(columns=["participant_id", "cohort", "date"]), on="day", how="left")

    nutrition_daily = base[["participant_id", "cohort", "day", "date"]].assign(
        energy_kcal=np.round(energy_kcal, 0),
        protein_g=np.round(protein_g, 0),
        carbohydrate_g=np.round(carbohydrate_g, 0),
        fat_g=np.round(fat_g, 0),
        fiber_g=np.round(fiber_g, 1),
        sodium_mg=np.round(sodium_mg, 0),
        potassium_mg=np.round(potassium_mg, 0),
        magnesium_mg=np.round(magnesium_mg, 0),
        zinc_mg_food=np.round(zinc_mg_food, 1),
        iron_mg=np.round(iron_mg, 1),
        omega3_g=np.round(omega3_g, 2),
        caffeine_mg=np.round(caffeine_mg, 0),
        alcohol_g=np.round(alcohol_g, 1),
        late_meal_count=late_meal_count.astype(int),
        last_meal_hour=np.round(last_meal_hour, 2),
        eating_window_hrs=np.round(eating_window_hrs, 1),
        post_meal_walks=np.round(post_meal_walks, 0).astype(int),
    )

    sleep_environment_daily = base[["participant_id", "cohort", "day", "date"]].assign(
        bedroom_temp_c=np.round(bedroom_temp_c, 1),
        bedroom_humidity_pct=np.round(bedroom_humidity, 0),
        bedroom_co2_ppm=np.round(bedroom_co2, 0),
        bedroom_noise_db=np.round(bedroom_noise, 1),
        bedroom_light_lux=np.round(bedroom_light, 1),
        window_open=window_open.astype(int),
        thermostat_target_c=np.round(np.clip(21.2 - np.maximum(temp_c - 26, 0) * 0.05, 19.5, 22.5), 1),
    )

    supplement_daily = base[["participant_id", "cohort", "day", "date"]].assign(
        supp_melatonin=supp_melatonin.astype(int),
        melatonin_mg=np.where(supp_melatonin > 0, 1.0 + (rng.random(n) > 0.82) * 2.0, 0.0),
        supp_l_theanine=supp_l_theanine.astype(int),
        l_theanine_mg=np.where(supp_l_theanine > 0, 200.0, 0.0),
        supp_zinc=supp_zinc.astype(int),
        zinc_supp_mg=np.where(supp_zinc > 0, 15.0, 0.0),
        supp_magnesium=supp_magnesium.astype(int),
        magnesium_supp_mg=np.where(supp_magnesium > 0, 200.0, 0.0),
        supp_creatine=supp_creatine.astype(int),
        creatine_g=np.where(supp_creatine > 0, 3.0, 0.0),
    )

    cgm_daily = base[["participant_id", "cohort", "day", "date"]].assign(
        fasting_glucose=np.round(fasting_glucose, 0),
        glucose_mean=np.round(glucose_mean, 0),
        glucose_cv=np.round(glucose_cv, 1),
        postprandial_peak_mg_dl=np.round(postprandial_peak, 0),
        postprandial_auc=np.round((postprandial_peak - 100) * 2.4 + carbohydrate_g * 0.45, 0),
        time_above_140_pct=np.round(time_above_140, 1),
        overnight_glucose=np.round(fasting_glucose - 2 + rng.normal(0, 2, n), 0),
        cgm_minutes=np.full(n, 1440, dtype=int),
    )

    wearables_daily = base[["participant_id", "cohort", "day"]].assign(
        hrv_daily=np.round(hrv_daily, 1),
        resting_hr=np.round(resting_hr, 1),
        sleep_efficiency=np.round(sleep_efficiency, 1),
        sleep_quality=np.round(sleep_quality, 1),
        deep_sleep=np.round(deep_sleep, 1),
        sleep_hrs=np.round(sleep_hrs, 2),
        steps=np.round(steps, 0),
    )

    lifestyle_app = base[["participant_id", "cohort", "day"]].assign(
        run_km=np.round(run_km, 1),
        training_min=np.round(training_min, 0),
        zone2_min=np.round(zone2_min, 0),
        steps=np.round(steps, 0),
        sleep_hrs=np.round(sleep_hrs, 2),
        bedtime_hr=np.round(bedtime_hr, 2),
        protein_g=np.round(protein_g, 0),
        energy_kcal=np.round(energy_kcal, 0),
        carbohydrate_g=np.round(carbohydrate_g, 0),
        fat_g=np.round(fat_g, 0),
        fiber_g=np.round(fiber_g, 1),
        late_meal_count=late_meal_count.astype(int),
        post_meal_walks=np.round(post_meal_walks, 0).astype(int),
        bedroom_temp_c=np.round(bedroom_temp_c, 1),
        cycle_luteal_phase=luteal.astype(int),
        luteal_symptom_score=np.round(luteal_symptoms, 1),
        perceived_stress=np.round(stress, 0),
        caffeine_mg=np.round(caffeine_mg, 0),
        alcohol_g=np.round(alcohol_g, 1),
        supp_melatonin=supp_melatonin.astype(int),
        supp_l_theanine=supp_l_theanine.astype(int),
        supp_zinc=supp_zinc.astype(int),
        temp_c=np.round(temp_c, 1),
        humidity_pct=np.round(humidity, 0),
        heat_index_c=np.round(heat_index, 1),
        aqi=np.round(aqi, 0),
        uv_index=np.round(uv_index, 1),
    )

    adherence = base[["participant_id", "cohort", "day"]].assign(
        adherence_score=np.round(_clip_array(0.74 + progress * 0.08 - stress / 700 + rng.normal(0, 0.045, n), 0.35, 0.98), 3)
    )

    subjective_daily = base[["participant_id", "cohort", "day", "date"]].assign(
        energy_score=np.round(_clip_array(72 + (sleep_efficiency - 86) * 0.8 - luteal_symptoms * 1.2 + rng.normal(0, 7, n), 20, 98), 0),
        mood_score=np.round(_clip_array(76 - stress * 0.22 - luteal_symptoms * 1.0 + rng.normal(0, 8, n), 18, 99), 0),
        perceived_stress=np.round(stress, 0),
        soreness_score=np.round(_clip_array(training_min / 20 + luteal * 0.6 + rng.normal(0, 1.2, n), 0, 9), 1),
        cravings_score=np.round(_clip_array(2.2 + luteal * 1.8 + late_meal_count * 0.7 - fiber_g * 0.04 + rng.normal(0, 1.1, n), 0, 9), 1),
    )

    body_composition = base.loc[(base["day"] - 1) % 28 == 0, ["participant_id", "cohort", "day", "date"]].copy()
    idx = body_composition["day"].to_numpy(dtype=int) - 1
    body_composition["body_mass_kg"] = np.round(body_mass[idx], 1)
    body_composition["body_fat_pct"] = np.round(body_fat[idx], 1)
    body_composition["waist_cm"] = np.round(88 - progress[idx] * 8 + rng.normal(0, 1.2, len(idx)), 1)

    meal_events = _meal_events_from_daily(nutrition_daily, rng)
    blood_draws = _blood_draws_from_daily(
        base,
        nutrition_daily,
        cgm_daily,
        lifestyle_app,
        wearables_daily,
        supplement_daily,
        body_mass,
        body_fat,
        rng,
    )

    return {
        "rich_daily_context": daily_context,
        "nutrition_daily": nutrition_daily,
        "meal_events": meal_events,
        "cgm_daily": cgm_daily,
        "cycle_daily": cycle,
        "sleep_environment_daily": sleep_environment_daily,
        "supplement_daily": supplement_daily,
        "subjective_daily": subjective_daily,
        "body_composition": body_composition,
        "wearables_daily": wearables_daily,
        "lifestyle_app": lifestyle_app,
        "blood_draws": blood_draws,
        "adherence": adherence,
    }


def _clip_array(values: np.ndarray | pd.Series | float, lo: float, hi: float) -> np.ndarray:
    return np.clip(np.asarray(values, dtype=float), lo, hi)


def _meal_events_from_daily(nutrition: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    meal_templates = [
        ("breakfast", 0.24, 8.1),
        ("lunch", 0.34, 12.7),
        ("dinner", 0.36, 18.7),
        ("snack", 0.06, 15.8),
    ]
    for daily in nutrition.itertuples(index=False):
        late = int(daily.late_meal_count)
        for meal_name, frac, hour in meal_templates:
            if meal_name == "snack" and rng.random() < 0.22:
                continue
            meal_hour = hour + rng.normal(0, 0.35)
            if meal_name == "dinner" and late > 0:
                meal_hour += 1.6 + 0.4 * late
            rows.append(
                {
                    "participant_id": SARAH_PID,
                    "cohort": SARAH_COHORT,
                    "day": int(daily.day),
                    "date": daily.date,
                    "meal_type": meal_name,
                    "meal_hour": _round(_clip(meal_hour, 5.5, 24.3), 2),
                    "calories": _round(float(daily.energy_kcal) * frac + rng.normal(0, 45), 0),
                    "protein_g": _round(float(daily.protein_g) * frac + rng.normal(0, 3), 1),
                    "carbohydrate_g": _round(float(daily.carbohydrate_g) * frac + rng.normal(0, 6), 1),
                    "fat_g": _round(float(daily.fat_g) * frac + rng.normal(0, 4), 1),
                    "fiber_g": _round(float(daily.fiber_g) * frac + rng.normal(0, 1.2), 1),
                    "image_logged": int(rng.random() < 0.74),
                    "portion_confidence": _round(_clip(0.78 + rng.normal(0, 0.08), 0.45, 0.97), 2),
                }
            )
    return pd.DataFrame(rows)


def _blood_draws_from_daily(
    base: pd.DataFrame,
    nutrition: pd.DataFrame,
    cgm: pd.DataFrame,
    lifestyle: pd.DataFrame,
    wearables: pd.DataFrame,
    supplement: pd.DataFrame,
    body_mass: np.ndarray,
    body_fat: np.ndarray,
    rng: np.random.Generator,
) -> pd.DataFrame:
    draw_days = np.array([1, 100, 247, 392, 548, 703, 861, 1018, 1176, 1331, 1488, 1646, 1803, 1961, 2118, 2276, 2433, 2700])
    draw_days = draw_days[draw_days <= len(base)]
    rows: list[dict[str, object]] = []

    for day in draw_days:
        lo = max(1, int(day) - 27)
        sl = slice(lo - 1, int(day))
        prog = (int(day) - 1) / max(len(base) - 1, 1)
        gluc = float(cgm.iloc[sl]["fasting_glucose"].mean())
        insulin = _clip(13.5 - prog * 4.8 + (gluc - 95) * 0.08 + rng.normal(0, 0.8), 2.5, 24)
        tg = _clip(156 - prog * 35 + float(nutrition.iloc[sl]["carbohydrate_g"].mean()) * 0.07 - float(nutrition.iloc[sl]["fiber_g"].mean()) * 1.2 + rng.normal(0, 8), 55, 240)
        hscrp = _clip(1.5 - prog * 0.45 + float(lifestyle.iloc[sl]["alcohol_g"].mean()) * 0.012 + rng.normal(0, 0.22), 0.2, 5.5)
        zinc_status = _clip(69 + prog * 19 + float(supplement.iloc[sl]["supp_zinc"].mean()) * 5.5 + rng.normal(0, 3.0), 55, 112)

        row: dict[str, object] = {
            "participant_id": SARAH_PID,
            "cohort": SARAH_COHORT,
            "age": SARAH_AGE,
            "is_female": SARAH_IS_FEMALE,
            "draw_day": int(day),
        }
        for marker, prior in BIOMARKER_PRIORS.items():
            val = prior.mean + rng.normal(0, prior.std * 0.12)
            if marker == "glucose":
                val = gluc + rng.normal(0, 1.5)
            elif marker == "insulin":
                val = insulin
            elif marker == "hba1c":
                val = 5.75 - prog * 0.48 + rng.normal(0, 0.06)
            elif marker == "triglycerides":
                val = tg
            elif marker == "hdl":
                val = 57 + prog * 5 + float(lifestyle.iloc[sl]["training_min"].mean()) * 0.025 + rng.normal(0, 2.2)
            elif marker == "ldl":
                val = 116 - prog * 12 + rng.normal(0, 5)
            elif marker == "apob":
                val = 94 - prog * 10 + rng.normal(0, 4)
            elif marker == "hscrp":
                val = hscrp
            elif marker == "cortisol":
                val = 12.5 + float(lifestyle.iloc[sl]["luteal_symptom_score"].mean()) * 0.18 + rng.normal(0, 1.1)
            elif marker == "estradiol":
                val = 70 + rng.normal(0, 18)
            elif marker == "testosterone":
                val = 34 + rng.normal(0, 6)
            elif marker == "zinc":
                val = zinc_status
            elif marker == "magnesium_rbc":
                val = 4.8 + float(supplement.iloc[sl]["supp_magnesium"].mean()) * 0.25 + rng.normal(0, 0.18)
            elif marker == "omega3_index":
                val = 4.6 + prog * 1.6 + float(nutrition.iloc[sl]["omega3_g"].mean()) * 0.25 + rng.normal(0, 0.35)
            elif marker == "body_mass_kg":
                val = body_mass[int(day) - 1] + rng.normal(0, 0.25)
            elif marker == "body_fat_pct":
                val = body_fat[int(day) - 1] + rng.normal(0, 0.35)
            elif marker == "ferritin":
                val = 52 - prog * 3 + rng.normal(0, 5)
            elif marker == "hemoglobin":
                val = 13.4 + rng.normal(0, 0.25)
            elif marker == "wbc":
                val = 5.7 + hscrp * 0.18 + rng.normal(0, 0.35)
            elif marker == "nlr":
                val = 1.55 + hscrp * 0.12 + rng.normal(0, 0.12)
            row[marker] = _round(_clip(float(val), prior.clip_lo, prior.clip_hi), 2)
        rows.append(row)
    return pd.DataFrame(rows)


def _replace_pid_rows(path: Path, rich_rows: pd.DataFrame) -> None:
    if path.exists():
        existing = pd.read_csv(path)
        if "participant_id" in existing.columns:
            existing = existing[existing["participant_id"] != SARAH_PID]
        out = pd.concat([existing, rich_rows], ignore_index=True, sort=False)
    else:
        out = rich_rows.copy()
    sort_cols = [c for c in ("participant_id", "day", "draw_day") if c in out.columns]
    if sort_cols:
        out = out.sort_values(sort_cols, kind="mergesort")
    out.to_csv(path, index=False)


def attach_rich_member_data(output_dir: str | Path, seed: int = 33441) -> dict[str, pd.DataFrame]:
    """Write rich member tables and align core pipeline CSVs for participant 3."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    frames = generate_sarah_rich_frames(seed=seed)

    canonical_names = [
        "rich_daily_context",
        "nutrition_daily",
        "meal_events",
        "cgm_daily",
        "cycle_daily",
        "sleep_environment_daily",
        "supplement_daily",
        "subjective_daily",
        "body_composition",
    ]
    for name in canonical_names:
        frames[name].to_csv(output_dir / f"{name}.csv", index=False)

    _replace_pid_rows(output_dir / "wearables_daily.csv", frames["wearables_daily"])
    _replace_pid_rows(output_dir / "lifestyle_app.csv", frames["lifestyle_app"])
    _replace_pid_rows(output_dir / "blood_draws.csv", frames["blood_draws"])
    _replace_pid_rows(output_dir / "adherence.csv", frames["adherence"])

    manifest = {
        "participant_id": SARAH_PID,
        "record_start": SARAH_START.strftime("%Y-%m-%d"),
        "record_end": SARAH_END.strftime("%Y-%m-%d"),
        "days": int(len(frames["lifestyle_app"])),
        "lab_draws": int(len(frames["blood_draws"])),
        "meal_events": int(len(frames["meal_events"])),
        "streams": canonical_names,
    }
    (output_dir / "rich_member_manifest.json").write_text(json.dumps(manifest, indent=2))
    return frames
