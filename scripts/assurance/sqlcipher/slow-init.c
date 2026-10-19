#include <stdatomic.h>
#include <time.h>
extern atomic_int probe_completed;
extern int probe_wait_for;
int sqlcipher_extra_init(const char *);
/* Timing-only fault injection: wait for the other cold callers, then run
 * the unchanged real initializer. Bounded by five seconds; never sleeps
 * during the preinitialized mechanism control. */
int probe_extra_init(const char *arg) {
  struct timespec delay = {0, 1000000};
  for (int i = 0; i < 5000 && atomic_load(&probe_completed) < probe_wait_for; i++) {
    nanosleep(&delay, 0);
  }
  return sqlcipher_extra_init(arg);
}
