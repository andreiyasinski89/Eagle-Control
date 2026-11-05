#!/usr/bin/env bash
# One backup of the database: dump, prove the dump can be restored, lock it with the public key, put it away.
#
#   real mode      the dump of the production database goes, locked, to the storage (daily/, and weekly/ on Sundays, monthly/ on the 1st)
#   selftest mode  the same, on a throwaway database made in the workflow, kept in a local folder, and unlocked again to prove the key works
#
# The workflow's log is public: nothing here prints an address, a password or a row. Only names of steps, sizes and OK / failure.
set -euo pipefail
set +x

: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${SCRATCH_URL:?SCRATCH_URL is not set}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT is not set}"
MODE="${BACKUP_MODE:-real}"
WORK="${BACKUP_WORK:-${RUNNER_TEMP:-/tmp}/backup}"
MIN_BYTES="${BACKUP_MIN_BYTES:-20000}"
mkdir -p "$WORK"
stamp="$(date -u +%Y-%m-%d)"
plain="$WORK/dump.pgdump"
locked="$WORK/$stamp.dump.age"

fail() {
  echo "::error title=Backup failed::$1"
  exit 1
}
# The dump in the clear lives only on this machine, only for these minutes.
trap 'rm -f "$plain" "$WORK/unlocked.pgdump"' EXIT
# Anything that looks like an address is hidden before an error is shown.
hide() { sed -E 's#[a-z]+://[^ ]+#<address>#g; s#host=[^ ]+#host=<hidden>#g'; }
count() { psql -tA -v ON_ERROR_STOP=1 "$1" -c "select count(*) from \"$2\"" | tr -d '[:space:]'; }

echo "1/6 dumping the database"
pg_dump --format=custom --no-owner --no-privileges --compress=6 --file="$plain" "$DATABASE_URL" 2>"$WORK/pg_dump.err" || {
  hide <"$WORK/pg_dump.err" | head -5
  fail "pg_dump could not read the database (see the lines above)"
}
size="$(stat -c %s "$plain")"
[ "$size" -ge "$MIN_BYTES" ] || fail "the dump is only $size bytes: a database of this kind is never that small"
pg_restore --list "$plain" >/dev/null 2>&1 || fail "the dump cannot be read back (pg_restore --list)"
echo "    dump made, $size bytes"

echo "2/6 restoring it into an empty throwaway database, to prove it can be restored"
psql -v ON_ERROR_STOP=1 -q "$SCRATCH_URL" -c 'drop schema if exists public cascade; create schema public;' >/dev/null || fail "the throwaway database is not available"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$SCRATCH_URL" "$plain" 2>"$WORK/restore.err" || {
  hide <"$WORK/restore.err" | head -5
  fail "the dump could not be restored into an empty database (see the lines above)"
}

echo "3/6 checking what came back"
tables="$(psql -tA "$SCRATCH_URL" -c "select count(*) from information_schema.tables where table_schema='public'" | tr -d '[:space:]')"
[ "$tables" -ge 60 ] || fail "only $tables tables came back; the schema has over 70"
if [ "$MODE" = "real" ]; then
  [ "$(psql -tA "$SCRATCH_URL" -c "select to_regclass('public._prisma_migrations') is not null" | tr -d '[:space:]')" = "t" ] || fail "the list of applied migrations is missing from the restored copy"
fi
for t in User Workspace Contact Membership; do
  live="$(count "$DATABASE_URL" "$t")"
  back="$(count "$SCRATCH_URL" "$t")"
  # The database goes on being used while it is copied: the live count may be a little higher, never lower.
  [ "$back" -le "$live" ] && [ $((live - back)) -le 200 ] || fail "the number of rows in $t is not the same after the restore"
done
echo "    tables and row counts agree with the live database"

echo "4/6 locking the dump with the public key"
age -r "$AGE_RECIPIENT" -o "$locked" "$plain" || fail "age could not lock the dump (is BACKUP_AGE_RECIPIENT a key starting with age1?)"
lsize="$(stat -c %s "$locked")"
[ "$lsize" -gt 0 ] || fail "the locked file is empty"
echo "    locked file $stamp.dump.age, $lsize bytes"

if [ "$MODE" = "selftest" ]; then
  : "${AGE_IDENTITY_FILE:?AGE_IDENTITY_FILE is not set}"
  echo "5/6 unlocking it again with the private key (self-test only)"
  age -d -i "$AGE_IDENTITY_FILE" -o "$WORK/unlocked.pgdump" "$locked" || fail "the private key does not unlock what the public key locked"
  cmp -s "$plain" "$WORK/unlocked.pgdump" || fail "the unlocked file is not the dump that was locked"
  echo "6/6 self-test passed: dump, restore, lock and unlock all work"
  exit 0
fi

: "${S3_ENDPOINT:?}" "${S3_BUCKET:?}" "${AWS_ACCESS_KEY_ID:?}" "${AWS_SECRET_ACCESS_KEY:?}"
# Storage services other than Amazon's refuse the extra checksums newer versions of the tool add.
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
export AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}"
put() {
  aws s3 cp --only-show-errors --endpoint-url "$S3_ENDPOINT" "$locked" "s3://$S3_BUCKET/$1/$stamp.dump.age" 2>"$WORK/aws.err" || {
    hide <"$WORK/aws.err" | head -5
    fail "the upload to $1/ failed (see the lines above)"
  }
  remote="$(aws s3api head-object --endpoint-url "$S3_ENDPOINT" --bucket "$S3_BUCKET" --key "$1/$stamp.dump.age" --query ContentLength --output text 2>/dev/null || echo 0)"
  [ "$remote" = "$lsize" ] || fail "$1/$stamp.dump.age is not on the storage, or has another size"
  echo "    $1/$stamp.dump.age is on the storage"
}
echo "5/6 putting it away"
put daily
[ "$(date -u +%u)" = "7" ] && put weekly
[ "$(date -u +%d)" = "01" ] && put monthly
echo "6/6 done"
exit 0
