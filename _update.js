const fs = require("fs");
const content = fs.readFileSync("src/views/CoachLandingView.tsx", "utf8");
const updated = content
  .replace(/from 'framer-motion'/g, "from 'framer-motion'")
  .replace(/bg-purple-50/g, "bg-[#b8aadd]/20")
  .replace(/text-purple-600/g, "text-[#9182c4]")
  .replace(/bg-rose-50/g, "bg-[#f8c8dc]/20")
  .replace(/text-rose-600/g, "text-[#e99bbe]")
  .replace(/bg-amber-50/g, "bg-[#89CCF0]/20")
  .replace(/text-amber-600/g, "text-[#5ba8d4]")
  .replace(/bg-green-50/g, "bg-[#96b9d0]/20")
  .replace(/text-green-600/g, "text-[#6a95b3]")
  .replace(/text-purple-500/g, "text-[#9182c4]")
  .replace(/text-rose-500/g, "text-[#e99bbe]")
  .replace(/text-blue-500/g, "text-[#5ba8d4]")
  .replace(/text-green-700/g, "text-[#6a95b3]")
  .replace(/text-amber-700/g, "text-[#5ba8d4]")
  .replace(/bg-amber-100/g, "bg-[#89CCF0]/30")
  .replace(/border-amber-100/g, "border-[#89CCF0]/30")
  .replace(/hover:bg-amber-100/g, "hover:bg-[#89CCF0]/30")
  .replace(/hover:bg-green-100/g, "hover:bg-[#96b9d0]/30")
  .replace(/text-primary-600/g, "text-[#5ba8d4]")
  .replace(/text-primary-700/g, "text-[#5ba8d4]")
  .replace(/bg-primary-50/g, "bg-[#89CCF0]/20")
  .replace(/bg-primary-100/g, "bg-[#89CCF0]/20")
  .replace(/from-primary-100/g, "from-[#89CCF0]/30")
  .replace(/to-primary-200/g, "to-[#89CCF0]/50")
  .replace(/hover:bg-primary-100/g, "hover:bg-[#89CCF0]/30");
fs.writeFileSync("src/views/CoachLandingView.tsx", updated);
console.log("Updated");
