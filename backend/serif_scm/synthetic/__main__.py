"""CLI entry point: python -m serif_scm.synthetic"""
from .generator import generate
import argparse

parser = argparse.ArgumentParser(description="Generate Serif synthetic data")
parser.add_argument("--output-dir", default="./output", help="Output directory")
parser.add_argument("--seed", type=int, default=42, help="Random seed")
args = parser.parse_args()
generate(seed=args.seed, output_dir=args.output_dir)
