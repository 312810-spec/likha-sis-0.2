#include "sqlite3.h"
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#define THREADS 32
static pthread_barrier_t start;
static atomic_int failed=0;
atomic_int probe_completed=0;
int probe_wait_for=0;
void *worker(void *arg) {
  sqlite3 *db = NULL;
  pthread_barrier_wait(&start);
  if(sqlite3_threadsafe()==0) return (void*)1;
  sqlite3_mutex *mutex = sqlite3_mutex_alloc(0);
  sqlite3_mutex_free(mutex);
  int rc=sqlite3_open_v2(":memory:", &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_URI | SQLITE_OPEN_NOMUTEX, NULL);
  if (rc == SQLITE_OK) {
    rc=sqlite3_exec(db,"PRAGMA key = \"x'0102030405060708091011121314151617181920212223242526272829303132'\";", NULL,NULL,NULL);
  }
  if(rc != SQLITE_OK) {
    atomic_fetch_add(&failed,1);
    fprintf(stderr,"synthetic open failure rc=%d: %s\n",rc,sqlite3_errmsg(db));
  }
  atomic_fetch_add(&probe_completed,1);
  sqlite3_close(db);
  return NULL;
}
int main(int argc,char **argv) {
  probe_wait_for = argc > 1 ? 0 : THREADS - 1;
  if(argc>1) { int rc=sqlite3_initialize(); if(rc!=SQLITE_OK)return 3; }
  pthread_t workers[THREADS];
  pthread_barrier_init(&start,NULL,THREADS);
  for(int i=0;i<THREADS;i++) pthread_create(&workers[i],NULL,worker,NULL);
  for(int i=0;i<THREADS;i++) pthread_join(workers[i],NULL);
  printf("{\"threads\":%d,\"failed\":%d,\"preinitialized\":%s}\n",THREADS,failed,argc>1?"true":"false");
  return failed?1:0;
}
