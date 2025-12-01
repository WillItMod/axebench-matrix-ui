# AxeBench Matrix UI - TODO

## Phase 1: Design & Setup
- [x] Design matrix/Gridrunner theme color palette and typography
- [x] Create design system documentation
- [x] Complete forensic analysis of all Python backend functionality
- [x] Document all 42 API endpoints
- [x] Document all 50+ buttons and their functions
- [x] Document all 40+ input fields
- [x] Document all data storage mechanisms
- [x] Document special modes (Auto, Nano Tune, Fine Tune)

## Phase 2: Core Layout & Navigation
- [x] Create matrix-themed navigation header
- [x] Build animated grid background component
- [x] Implement digital rain effect
- [x] Create main layout with tabs
- [x] Set up global CSS with matrix theme variables
- [x] Create API configuration and helper functions
- [x] Build Dashboard page with fleet stats
- [x] Create device card components
- [x] Add placeholder pages for Benchmark, Profiles, Sessionsoard layout

## Phase 3: Device Management
- [ ] Build device list view with matrix styling
- [ ] Create add device modal with auto-detection
- [ ] Implement device card component with live stats
- [ ] Add device removal functionality
- [ ] Create PSU management interface

## Phase 4: Real-time Monitoring
- [ ] Build live device status display
- [ ] Create real-time data polling system
- [ ] Implement hashrate visualization with matrix effects
- [ ] Add temperature monitoring with color-coded alerts
- [ ] Create power consumption graphs
- [ ] Build voltage/frequency display panels

## Phase 5: Benchmark System
- [ ] Create benchmark configuration panel
- [ ] Implement preset selection interface
- [ ] Build benchmark progress display with matrix effects
- [ ] Add live benchmark status updates
- [ ] Create benchmark results visualization
- [ ] Implement session history browser

## Phase 6: Profile Management
- [ ] Build profile list view
- [ ] Create profile application interface
- [ ] Implement custom profile creation
- [ ] Add profile comparison view

## Phase 7: Advanced Features
- [ ] Implement fan control interface
- [ ] Create settings panel for voltage/frequency
- [ ] Add device restart functionality
- [ ] Build notification system with matrix effects

## Phase 8: Polish & Testing
- [ ] Add loading states and animations
- [ ] Implement error handling with themed alerts
- [ ] Test all API integrations
- [ ] Optimize performance
- [ ] Add responsive design for mobile
- [ ] Create user documentation

## Phase 3: Core Functionality
- [x] Create AddDeviceModal with auto-detection
- [x] Build comprehensive Benchmark page with all 40+ config fields
- [x] Implement Auto Mode toggle and intelligent step adjustment
- [x] Add Auto-Recovery configuration
- [x] Build live benchmark status monitoring
- [x] Create comprehensive Profiles page
- [x] Implement profile apply/delete/save functionality
- [x] Add Nano Tune modal for fine-tuning profiles
- [x] Build comprehensive Sessions page
- [x] Implement session history with details modal
- [x] Add session logs viewer
- [x] Add plot visualization links

## Phase 4: Documentation & Polish
- [x] Update version numbers to v3.0.0 / v2.0
- [x] Create comprehensive README.md
- [x] Create SETUP_GUIDE.md with connection instructions
- [x] Configure API endpoint for localhost:5000
- [x] Verify CORS compatibility with Flask backend
- [x] Test all major UI components
- [x] Verify matrix aesthetic (grid, rain, glow effects)

## Deployment Ready
- [x] All 42 API endpoints integrated
- [x] All 50+ buttons implemented
- [x] All 40+ input fields working
- [x] Auto Mode with intelligent stepping
- [x] Auto-Recovery system
- [x] Nano Tune functionality
- [x] Real-time monitoring
- [x] Session management
- [x] Profile system
- [x] Device management with auto-detection

## Bug Fixes - User Reported Issues
- [ ] Fix device status not updating (showing OFFLINE when devices are online)
- [ ] Fix BENCHMARK button not working on device cards
- [ ] Fix CONFIG button not working on device cards
- [ ] Fix Gamma (ONI370) device model buttons
- [ ] Verify Flask backend API connection
- [ ] Check CORS configuration
- [ ] Test real-time polling intervals
- [ ] Add Auto Tune button to Benchmark page
- [ ] Add Easy/Expert mode toggle
- [ ] Implement Quick Tune presets (Conservative, Balanced, Aggressive)
- [ ] Fix "error loading profiles" issue
- [ ] Add Hardware Preset buttons (Stock, Quick Tune, Upgraded PSU, etc.)
- [ ] Make Auto Mode toggle more prominent
- [ ] Verify Flask backend connection and API responses
- [ ] Add PROFILE button to device cards
- [ ] Fix session logs showing "No logs available"
- [ ] Add NANO TUNE button to Profiles page for fine-tuning existing profiles
- [ ] Implement NANO TUNE modal with 4 goals (max_hashrate, efficient, balanced, quiet)

## CRITICAL: Multi-Service Architecture
- [ ] Document that AxeBench requires 3 services running:
  1. web_interface.py (port 5000) - Main API
  2. axeshed.py - Device management service
  3. axepool.py - Pool management service
- [ ] Add service status indicators to UI
- [ ] Add instructions for starting all 3 services

## Flask Connection Issues - CHECKPOINT READY
- [x] Fix device status parsing (Flask returns devices but UI shows OFFLINE)
- [x] Verify API response format matches UI expectations
- [x] Add proper error handling for missing 'online' field
- [x] Test with real Flask API responses
- [x] Fix device model not auto-selecting when device is chosen in Benchmark page
- [x] Fix API endpoint (.env configured for localhost:5000)
- [x] Device status now properly fetches from /api/devices/<name>/status

## READY FOR USER TESTING
- [ ] Refresh browser and verify devices show ONLINE
- [ ] Test BENCHMARK button on device cards
- [ ] Test CONFIG button on device cards
- [ ] Test Start Benchmark functionality
- [ ] Verify profile loading works

## Missing Apps
- [ ] Add AxeShed page (Fleet Scheduler) to navigation
- [ ] Implement AxeShed interface for time-based profile scheduling
- [ ] Add AxePool page (Pool Management) to navigation
- [ ] Implement AxePool interface for pool switching

## CRITICAL BUG - Device Rendering
- [ ] API successfully returns 4 devices (Gamma 601, Gamma 602, test, test 2)
- [ ] Network tab shows 200 OK with correct JSON data
- [ ] But UI shows "NO_DEVICES_DETECTED" instead of device cards
- [ ] No JavaScript errors in console
- [ ] Issue is in Dashboard rendering logic - devices array not being rendered

## Logging & Debugging
- [x] Add comprehensive file-based logging system
- [x] Log all API calls (request/response)
- [x] Log device state changes
- [x] Log component render cycles
- [ ] Create debug log viewer in UI (can use window.axebenchLogger.downloadLogs() for now)

## Diagnostic Tools Created
- [x] test-flask-connection.js - Tests Flask API connectivity
- [x] TROUBLESHOOTING.md - Comprehensive troubleshooting guide
- [x] Logger utility with localStorage persistence
- [x] window.axebenchLogger.downloadLogs() - Download logs as file

## WSL Networking Fix
- [x] Identified WSL localhost issue - Flask accessible at WSL IP but not localhost from Windows
- [x] Created .env with VITE_API_BASE_URL=http://127.0.0.1:5000
- [x] Verified Flask runs on 0.0.0.0:5000
- [x] Updated CORS to support credentials
- [x] Added credentials: 'include' to API fetch calls
- [ ] Debug why devices still show OFFLINE after .env configuration
- [ ] Test device status API calls in browser Network tab

## Device Card Button Fixes
- [ ] Fix BENCHMARK button to navigate to Benchmark page with device pre-selected
- [ ] Fix CONFIG button to open device configuration modal/page
- [ ] Add click handlers to device card buttons
- [ ] Pass device name/data to target pages

## Uptime Tracking Implementation
- [x] Added /api/uptime endpoint to Flask backend (web_interface.py)
- [x] Added system.uptime() API method to client/src/lib/api.ts
- [x] Added formatUptime() utility function to format seconds as human-readable
- [x] Updated Layout.tsx to fetch and display real backend uptime
- [x] Replaced infinity symbol (∞) with live uptime display
- [x] Auto-refresh uptime every 30 seconds
- [x] Graceful fallback to ∞ if backend is unavailable

## Dashboard Fleet Stats Improvements
- [x] Combine "TOTAL DEVICES" and "ONLINE" into single "DEVICES ONLINE: X/Y" panel
- [x] Add "FLEET EFFICIENCY" panel showing combined efficiency (J/TH)
- [x] Add "HIGHEST DIFFICULTY" display showing device name and difficulty value
- [x] Fetch difficulty data from device status API
- [x] Calculate fleet efficiency from total power and total hashrate
- [x] Keep 4-panel grid layout: Devices Online, Fleet Hashrate, Total Power, Fleet Efficiency

## Benchmark Page - Missing Features (from v1.12)
- [x] Add EASY/ADVANCED toggle at top of page
- [x] EASY mode: Simple interface with just device select, preset dropdown, and Start button
- [x] ADVANCED mode: Full configuration panel with all options
- [x] Move Auto Mode toggle to ADVANCED mode only
- [ ] Add Profile/Preset dropdown (Quick Test, Conservative, Aggressive, Efficiency, Max Performance, Paranoid, Custom)
- [ ] Add Search Strategy dropdown (Adaptive Grid, Linear, Binary)
- [ ] Add Optimization Goal dropdown (Balanced, Max Hashrate, Max Efficiency)
- [ ] Add advanced checkboxes (Restart between tests, Enable plots, Export CSV)
- [ ] Add Hardware Preset buttons (Stock, Quick Tune, Upgraded PSU, etc.)
- [ ] Ensure all 40+ config fields are accessible in ADVANCED mode
- [ ] Hide complex options in EASY mode for better UX

## Dashboard - CONFIG Button
- [x] Create ConfigModal component for device settings
- [x] Add voltage and frequency adjustment
- [x] Add fan control (auto/manual with target temp)
- [x] Add device restart button
- [x] Connect CONFIG button to modal

## Benchmark Page - Critical Fixes
- [x] Add "AUTO TUNE (FULL)" button that runs precision benchmark, generates 4 profiles (Quiet, Efficient, Optimal, Max), fine-tunes each, and applies Efficient
- [x] Fix AUTO_MODE - should be a simple on/off toggle (checkbox/switch), NOT a dropdown, default ON
- [x] AUTO_MODE should be visible in ADVANCED mode only
- [x] Add proper START BENCHMARK button styling and placement
- [x] Ensure preset mode works in EASY mode

## Missing Flask API Endpoints
- [ ] Add /api/uptime endpoint to Flask backend (currently causes footer uptime to fail)

## Dashboard - Difficulty Display Fix
- [x] Parse bestDiff string format ("4.29G", "3.83M", etc.) to numeric value for comparison
- [x] Find device with highest numeric difficulty
- [x] Display difficulty with original suffix format

## Profiles Page
- [ ] Create Profiles.tsx page component
- [ ] List all device profiles with voltage/frequency/power settings
- [ ] Add profile CRUD operations (Create, Read, Update, Delete)
- [ ] Add "Apply Profile" button to set device to profile settings
- [ ] Add "Nano Tune" button for fine-tuning profiles
- [ ] Connect to /api/profiles endpoints

## Sessions Page
- [ ] Create Sessions.tsx page component
- [ ] List benchmark session history with results
- [ ] Show session details (voltage/frequency ranges, duration, best results)
- [ ] Add session filtering and sorting
- [ ] Add "View Logs" and "View Plots" buttons
- [ ] Connect to /api/sessions endpoints

## Virtual/Mock Device API
- [ ] Create mock device data generator with realistic BitAxe values
- [ ] Add virtual device endpoints (devices, status, profiles, sessions)
- [ ] Add toggle to switch between real Flask API and mock API
- [ ] Test all UI features with mock data

## Benchmark State Persistence
- [ ] Poll /api/benchmark/status on app mount to check if benchmark is running
- [ ] Restore benchmark state from backend status after page refresh
- [ ] Keep polling while benchmark is active to update progress
- [ ] Store benchmark state in React Context for global access

## Global Status Banner
- [ ] Create BenchmarkStatusBanner component that shows when benchmark is running
- [ ] Show progress, device name, current test parameters
- [ ] Display on all pages (add to Layout component)
- [ ] Add dismiss/minimize button
- [ ] Support both benchmark and nano-tune status

## Benchmark Console & Live Monitoring
- [x] Add console/log viewer to Benchmark page
- [x] Fetch logs from /api/benchmark/status or session logs
- [x] Auto-scroll to bottom as new logs appear
- [x] Show timestamp, log level, and message
- [ ] Add clear logs button
- [x] Add live monitoring panel with real-time device stats
- [ ] Show charts for hashrate, power, voltage, frequency, temperature

## Benchmark STOP Button
- [x] Add STOP button that appears when benchmark is running
- [x] Call /api/benchmark/stop endpoint
- [x] Update UI state after stopping

## Operations (AxeShed Scheduler) Page
- [x] Import ShedPage from v3.0
- [x] Add profile scheduling interface
- [x] Allow time-based profile switching
- [x] Add navigation tab for Operations

## Pool Management (AxePool) Page
- [x] Import PoolPage from v3.0
- [x] Add pool configuration interface
- [x] Add pool failover management
- [x] Add navigation tab for Pool

## Patreon Authentication & Device Limits
- [ ] Create PatreonAuth context for authentication state
- [ ] Add Patreon login button in header
- [ ] Implement OAuth flow with Patreon API
- [ ] Store user tier (Free, Premium, Ultimate) in context
- [ ] Enforce device limits: Free (5), Premium (25), Ultimate (250)
- [ ] Show device count warning when approaching limit
- [ ] Block adding devices when limit reached
- [ ] Add nag banner for free users (every 15 minutes)
- [ ] Add thank you banner for Premium/Ultimate users
- [ ] Persist auth state in localStorage

## CURRENT SPRINT - Live Monitoring & Advanced Features
- [x] Create LiveMonitoringPanel component for Benchmark page
- [x] Add real-time charts for hashrate, power, voltage, frequency, temperature
- [x] Poll device status every 1-2 seconds during benchmark
- [x] Display current test parameters and progress
- [x] Add Nano Tune status banner (similar to BenchmarkStatusBanner)
- [x] Add Auto Tune status banner with phase descriptions
- [ ] Create PatreonContext for authentication state
- [ ] Implement Patreon OAuth flow
- [ ] Add device limit enforcement (Free: 5, Premium: 25, Ultimate: 250)
- [ ] Add nag banner for free users (every 15 minutes)
- [ ] Add thank you banner for Premium/Ultimate users

## BUG - Profiles Page Error
- [x] Fix TypeError: Cannot read properties of null (reading 'is_best') in Profiles.tsx
- [x] Error occurs when selecting a device on Profiles page
- [x] Multiple locations affected: Canonious frame, Array.map, Profiles component
- [x] Issue: profiles data structure doesn't match expected format
- [x] Added null checks and handle missing profile data gracefully
- [x] Added optional chaining (?.) for is_best property access
- [x] Filter out null/invalid profiles before rendering

## BUG - STOP Button 404 Error
- [x] STOP button in control panel returns 404 error when clicked
- [x] Root cause: Frontend was connecting to port 5000, but AxePool runs on 5002
- [x] Updated API_BASE_URL from localhost:5000 to localhost:5002
- [x] Backend has /api/benchmark/stop route (verified in web_interface.py)
- [ ] Test STOP button functionality with AxePool running on port 5002

## BUG - Status Banner Issues
- [ ] Two identical "BENCHMARK_RUNNING" banners appear at top of page
- [ ] Banners show "Progress: 0% 1150mV @ 400MHz" even when no benchmark is active
- [ ] No benchmark TYPE shown in banner (should show: Benchmark, Auto Tune, or Nano Tune)
- [ ] Issue: All three banners (Benchmark, AutoTune, NanoTune) might be checking same status
- [ ] Need to add 'mode' field to distinguish benchmark types
- [ ] BenchmarkStatusBanner should only show for regular benchmarks (mode: 'benchmark')
- [ ] AutoTuneStatusBanner should only show when mode: 'auto_tune'
- [ ] NanoTuneStatusBanner should only show when mode: 'nano_tune'
- [ ] Check if backend is returning incorrect status or missing mode field
- [ ] Investigate why duplicate banners appear (Layout only has one of each)


## PRIORITY - AxeShed & AxePool Integration
- [x] Extract all API endpoints from axeshed.py
- [x] Extract all API endpoints from axepool.py
- [x] Add AxeShed endpoints to API client (client/src/lib/api.ts)
- [x] Add AxePool endpoints to API client (client/src/lib/api.ts)
- [x] Create Pool page UI for AxePool functionality
- [x] Create Operations page UI for AxeShed functionality
- [x] Update App.tsx with Pool and Operations routes
- [ ] Configure Vite proxy routing for multiple backends (if needed)
- [ ] Test Pool page with AxePool backend running
- [ ] Test Operations page with AxeShed backend running


## ConfigModal Enhancements - CRITICAL
- [ ] Add lower voltage limit input (currently only has upper)
- [ ] Add lower frequency limit input (currently only has upper)
- [ ] Add power limit configuration
- [ ] Add PSU type selector (Standalone vs Shared)
- [ ] Add standalone PSU settings (voltage, amps, capacity, safe watts, warning watts)
- [ ] Add shared PSU selector dropdown
- [ ] Create Shared PSU management page/modal
- [ ] Show shared PSU load calculations (total devices, current load, available capacity)
- [ ] Add shared PSU CRUD operations (Create, Read, Update, Delete)
- [ ] Persist PSU configurations to backend

## BUG - Duplicate Benchmark Banners
- [ ] Two identical banners show when benchmark running
- [ ] Investigate if backend is setting mode field correctly
- [ ] Verify BenchmarkStatusBanner conditional logic
- [ ] Test with actual benchmark to confirm fix

## Backend Logging & Session Persistence (User Request)
- [x] CRITICAL: Fix launcher.py JSON corruption error (added error handling)
- [x] CRITICAL: Fixed console panel logs - BenchmarkContext now reads session_logs from backend
- [ ] Implement file-based logging system for benchmark operations
- [ ] Log all benchmark events to timestamped log files
- [ ] Auto-save benchmark state periodically during operation
- [ ] Save complete session data when benchmark completes
- [ ] Save session data when benchmark is stopped/interrupted
- [ ] Ensure session files are written to ~/.bitaxe-benchmark/sessions/
- [ ] Add session metadata (start time, end time, device, results)

## Frontend Issues - Duplicate Banners
- [ ] CRITICAL: Fix duplicate benchmark banners (2 identical banners showing)
- [ ] Investigate why both BenchmarkStatusBanner and AutoTuneStatusBanner render
- [ ] Verify backend sets 'mode' field in /api/benchmark/status response
- [ ] Add default mode='benchmark' if backend doesn't set mode
- [ ] Ensure only ONE banner shows at a time based on operation mode

## Profiles Page - Critical Bugs
- [x] CRITICAL: Added debug logging to "Save Current Profile"
- [x] CRITICAL: Added debug logging to Delete button
- [x] CRITICAL: Fixed Nano Tune modal - removed editable fields (voltage/freq/duration)
- [ ] Nano Tune should auto-pull profile ranges from backend and submit directly
- [ ] Nano Tune should only show: base profile selector, optimization goal dropdown, START button
- [ ] Remove voltage range, frequency range, and test duration inputs from Nano Tune modal

## Pool Page - Critical Bugs
- [x] CRITICAL: Added debug logging and delayed refresh for pool creation
- [ ] CRITICAL: Pool not appearing in pool selection dropdown
- [ ] Pool creation API succeeds but UI doesn't refresh/update
- [ ] Need to reload pools after successful creation

## Sessions Page - Missing Features
- [x] CRITICAL: Added "Generate Profiles" button for completed sessions
- [ ] Generate Profiles should analyze session results and create 4 profiles (Quiet, Efficient, Optimal, Max)
- [ ] Button should only appear for COMPLETED sessions with valid results
- [ ] Should call /api/sessions/{id}/generate_profiles endpoint

## Benchmark Status - CRITICAL BUG
- [ ] CRITICAL: Benchmark starts but status banner disappears after 1 second
- [ ] Backend returns running:true initially, then immediately running:false
- [ ] Benchmark state not persisting across status polls
- [ ] Need to debug /api/benchmark/status endpoint
- [ ] Status should remain true while benchmark is actually running

## Dashboard - Display Bugs
- [x] CRITICAL: Added debug logging for difficulty values (shows raw and parsed)
- [ ] Need to check if backend returns difficulty in device status
- [ ] Frontend may not be calculating/displaying max difficulty correctly

## Test Results from User (2025-12-01)

### Sessions Page
- [ ] CRITICAL: Duration and Tests showing 0/0 - backend returns 0 values

### Profiles Page
- [x] CRITICAL: Fixed profile loading - unwraps 'profiles' key from backend response
- [x] CRITICAL: Fixed delete error - was caused by backend wrapping profiles in {profiles: {...}}
- [ ] CRITICAL: Save Current creates profile but values show as blank (backend returns correct data)
- [ ] Profile display not showing voltage/frequency values from backend response

### Nano Tune Modal
- [ ] Should show voltage/frequency ranges (e.g., "500-600MHz, 1125-1150mV")
- [ ] Currently only shows optimization goal

### Pool Page
- [ ] CRITICAL: Pool created successfully but list remains empty
- [ ] Console shows: Created pool {id, status: 'saved'} but Loaded pools: []
- [ ] Backend returns empty array after pool creation
- [ ] CREATE_POOL button has no hover state - hard to tell it's clickable

### Dashboard
- [x] Devices loading correctly (console shows 3 devices)
- [ ] Highest Difficulty still shows 0 (need console logs from user)

## NEW CRITICAL BUGS (Dec 1, 2025)

### Benchmark Page - CRASH
- [x] CRITICAL: Fixed benchmark crash - BenchmarkConsole now handles both string and object logs
- [x] Root cause: BenchmarkConsole was trying to render log objects directly, now extracts message/time/type fields
- [ ] After crash, reload shows no benchmark running (but backend is still running it)

### Dashboard -> Benchmark Navigation
- [ ] CRITICAL: Clicking "Benchmark" button on device card goes to Benchmark page but doesn't pre-select device or load profile
- [ ] Should auto-select the device and populate ### Profiles Page - Save Current
- [x] CRITICAL: Added confirmation dialog for saving current settings as "custom" profile
- [ ] CRITICAL: No way to edit profile fields after creation (backend limitation)- [ ] Backend returns correct data but UI doesn't allow naming or editing

### Sessions Page - View Session
- [ ] CRITICAL: Clicking VIEW on session shows "No logs available" (backend not returning logs)
- [ ] CRITICAL: No JSON data from session (backend not returning session data)
- [ ] Sessions show N/A duration and 0/0 tests (backend not populating fields)
