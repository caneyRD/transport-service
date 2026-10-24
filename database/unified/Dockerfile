FROM postgres:18-bookworm
COPY schema.sql /docker-entrypoint-initdb.d/010-schema.sql
COPY init/020-app-role.sh /docker-entrypoint-initdb.d/020-app-role.sh
RUN chmod 755 /docker-entrypoint-initdb.d/020-app-role.sh
