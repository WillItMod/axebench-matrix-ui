# AxeBench Matrix UI - Master TODO List

## 🔴 CRITICAL FIXES

### Session History Issues
- [ ] **Duration showing blank** - Sessions page not displaying benchmark duration
- [ ] **Tests count showing blank** - Sessions page not showing number of tests completed
- [ ] **Console logs missing** - Session detail shows "no logs" even though benchmark ran
- [ ] **JSON output missing** - No JSON download button or data export for benchmark results

### Live Monitoring
- [ ] **Graphs not appearing** - LiveMonitoringPanel may not show during benchmark (debug logging added, needs testing)

### Best Difficulty
- [ ] **Showing 0** - Backend `/api/devices/{name}/info` endpoint needs implementation (BACKEND TASK)

---

## 🟡 HIGH PRIORITY FEATURES

### PSU Management
- [ ] **PSU Edit Modal** - Full edit functionality to modify PSU name and wattage (currently just shows toast)

### Bulk Operations
- [ ] **Apply to All Devices** - Button to apply pool/profile changes to entire fleet at once

### Live Monitoring Improvements
- [ ] **Reorder graphs:**
  - Graph 1: ASIC errors + Hashrate
  - Graph 2: VR temp + ASIC temp
  - Graph 3: Power + J/TH (efficiency)
- [ ] **Create dedicated "Monitoring" tab** - Always-on monitoring, not just during benchmarks
- [ ] **Multi-device view** - Monitor multiple devices simultaneously with comparison

---

## 🟢 COMPLETED ✅

### PSU System
- [x] Simplified PSU modal (name + wattage only)
- [x] Device PSU assignment in ConfigModal
- [x] PSU cards showing assigned devices
- [x] PSU delete button with confirmation
- [x] Power calculation from assigned devices

### Operations Page
- [x] Replaced dropdowns with toggle buttons (devices, pools)
- [x] Color-coded pool selection (green/cyan)

### Benchmark
- [x] Console height increased 50%
- [x] Plots enabled by default
- [x] CSV export enabled by default
- [x] Device pre-selection from Dashboard
- [x] Duplicate banner removed

### Profiles
- [x] JSON export button

---

## 📋 BACKEND REQUIREMENTS (Outside Frontend Scope)

These require Python Flask backend changes:

- [ ] `/api/devices/{name}/info` - Return bestDiff and bestSessionDiff fields
- [ ] `/api/sessions` - List past benchmark runs with duration and test counts
- [ ] `/api/sessions/{id}` - Get session details including:
  - Duration
  - Tests completed
  - Console logs
  - JSON results data
- [ ] Sessions database table - Store all benchmark session data
- [ ] Save console logs to sessions table during benchmark
- [ ] Save JSON results to sessions table after benchmark completes

---

## 🎯 PRIORITY ORDER

1. **Session History fixes** (duration, tests, logs, JSON export)
2. **PSU Edit Modal**
3. **Live Monitoring graph reorder**
4. **Monitoring tab creation**
5. **Bulk Operations**
6. **Multi-device monitoring**

---

## 📝 NOTES

- Live Monitoring has debug logging - check browser console when benchmark runs
- Best Difficulty requires backend endpoint implementation
- Session data issues are likely backend - frontend is ready to display once data is available


## 🔧 UI CLEANUP

### Hide Old UI
- [ ] **Identify old UI components** - Determine which pages/features are legacy
- [ ] **Choose hiding strategy:**
  - Option A: Feature flag toggle in settings
  - Option B: Remove completely from codebase
  - Option C: Move to `/legacy` route (hidden from nav)
  - Option D: Admin-only access via direct URL
- [ ] **Implementation** - Apply chosen strategy
