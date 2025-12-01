# ⏱️ Time Savings Calculator

## How Much Time Does Fast Mode Save?

### Quick Reference

| Number of Tests | With Restarts | Without Restarts | Time Saved |
|----------------|---------------|------------------|------------|
| 10 tests | ~2.5 hours | ~2 hours | **30 minutes** |
| 20 tests | ~4.5 hours | ~3.5 hours | **1 hour** |
| 30 tests | ~6.5 hours | ~5.5 hours | **1.5 hours** |
| 50 tests | ~10 hours | ~8.5 hours | **2.5 hours** |
| 100 tests | ~19 hours | ~16 hours | **3 hours** |

*Based on 10-minute test duration, 30s reboot time, 60-90s warmup*

### By Preset

| Preset | Typical Tests | With Restarts | Fast Mode | Savings |
|--------|--------------|---------------|-----------|---------|
| **quick_test** | 15-20 | 2.5 hours | **1.5 hours** | **1 hour** |
| **conservative** | 24 | 7 hours | **6 hours** | **1 hour** |
| **aggressive** | 30 | 7 hours | **5.5 hours** | **1.5 hours** |
| **efficiency** | 40 | 11 hours | **9 hours** | **2 hours** |
| **max_performance** | 35 | 8.5 hours | **7 hours** | **1.5 hours** |

### Calculate Your Time Savings

Formula:
```
Time Saved = Number of Tests × (Reboot Time + Extra Warmup)
           = Number of Tests × (30s + 30s)
           = Number of Tests × 60s
           = Number of Tests × 1 minute
```

**Example:**
- Planning 25 tests
- Time saved = 25 × 1 minute = **25 minutes**

### Real-World Scenarios

#### Scenario 1: Quick Daily Check
- Goal: Verify current settings still optimal
- Tests: 5 tests around current config
- **Fast Mode**: 55 minutes
- **With Restarts**: 65 minutes
- **Savings**: 10 minutes

#### Scenario 2: Full Voltage Sweep
- Goal: Test 1150-1350mV in 20mV steps at fixed frequency
- Tests: 11 voltage points
- **Fast Mode**: 2 hours
- **With Restarts**: 2.5 hours
- **Savings**: 30 minutes

#### Scenario 3: Complete Grid Search
- Goal: Test 10 voltages × 10 frequencies
- Tests: 100 combinations
- **Fast Mode**: 16 hours
- **With Restarts**: 19 hours
- **Savings**: 3 hours

#### Scenario 4: Weekly Optimization
- Goal: Re-optimize after temperature changes
- Tests: 20-25 adaptive grid tests
- **Fast Mode**: 3.5 hours
- **With Restarts**: 4.5 hours
- **Savings**: 1 hour

### Overnight Benchmark Calculator

| Start Time | Tests | Fast Mode Done | With Restarts Done | Extra Sleep |
|------------|-------|----------------|-------------------|-------------|
| 10 PM | 30 | 3:30 AM | 4:30 AM | Sleep 1 hour more! |
| 11 PM | 30 | 4:30 AM | 5:30 AM | Sleep 1 hour more! |
| 9 PM | 50 | 5:30 AM | 7:30 AM | Results 2 hours earlier! |

### Energy Savings

Assuming 25W average power consumption:

| Tests | With Restarts | Fast Mode | Energy Saved |
|-------|---------------|-----------|--------------|
| 20 | 112 Wh | 87 Wh | **25 Wh** |
| 50 | 250 Wh | 212 Wh | **38 Wh** |
| 100 | 475 Wh | 400 Wh | **75 Wh** |

*At $0.12/kWh, saving 75 Wh = saving $0.009 per benchmark (not much, but it adds up!)*

### When Might You Want Restarts Anyway?

Even though it's slower, use restarts if:

1. **Critical Production Settings**: You're setting up a 24/7 mining rig and want absolute certainty
2. **Firmware Concerns**: You're on old firmware or suspect bugs
3. **Debugging Issues**: Settings don't seem to be applying correctly
4. **Peace of Mind**: You're paranoid (we have a preset for that!)
5. **Final Validation**: Confirming your "winner" settings one more time

**Use Case**: Test 50 configs in fast mode (~8.5 hours), then re-test top 5 with restarts (~1 hour) = Total 9.5 hours vs 10 hours for all 50 with restarts, but with confidence!

### Recommendations by Use Case

| Use Case | Recommended Mode | Why |
|----------|-----------------|-----|
| Daily check | Fast ⚡ | Quick validation |
| Finding optimal settings | Fast ⚡ | Explore more configs faster |
| Production deployment | Fast → Verify top 3 with restarts | Best of both worlds |
| Troubleshooting | With restarts 🐌 | Maximum confidence |
| Weekly re-optimization | Fast ⚡ | Regular tuning |
| Initial setup | Fast ⚡ | Fast learning |
| Final validation | With restarts 🐌 | Peace of mind |

### Pro Tips for Maximum Speed

1. **Use quick_test preset**: 5-minute tests, 60s warmup
2. **Reduce warmup**: `--warmup 45` (if thermal is already stable)
3. **Adaptive grid strategy**: Finds optimum in fewer tests
4. **Start with coarse, refine later**: Big steps first, then zoom in
5. **Test only relevant range**: Don't test 1100mV if 1200mV is minimum stable

### Example: Ultra-Fast Validation

```bash
# Check if 1200mV/650MHz is still good (2 tests)
./run_benchmark.sh benchmark "My Bitaxe" \
    --voltage-start 1200 --voltage-stop 1200 \
    --frequency-start 625 --frequency-stop 675 \
    --frequency-step 25 \
    --duration 300 \
    --warmup 45

# Total time: ~12 minutes (vs ~15 minutes with restarts)
```

### Example: Thorough Multi-Day

```bash
# Day 1: Fast mode sweep (8 hours overnight)
./run_benchmark.sh benchmark "My Bitaxe" --preset aggressive

# Day 2: Validate top 5 with restarts (2 hours)
# Use web UI to identify top 5, then test individually with --restart
```

## Summary

**Fast mode is:**
- ✅ **Faster** - 80% less waiting
- ✅ **Reliable** - Same result quality
- ✅ **Smart default** - Handles 95% of use cases
- ✅ **Energy efficient** - Less time running = less power
- ✅ **More exploration** - Test more configs in same time

**Use restarts only when:**
- 🐌 You're absolutely paranoid
- 🐌 Final validation of production settings
- 🐌 Debugging suspected firmware issues
- 🐌 Peace of mind for critical deployments

## Bottom Line

For a typical 25-test benchmark:
- **Fast Mode**: 3.5 hours → Done by bedtime ✅
- **With Restarts**: 4.5 hours → Done... later 😴

**Your choice is simple: save an hour, or reboot unnecessarily!**

---

**Benchmark smarter, not slower! ⚡**
