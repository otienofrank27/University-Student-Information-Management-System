FROM php:8.3-apache

# PDO MySQL driver, MariaDB client (used by the Backup page), Apache modules
RUN apt-get update \
    && apt-get install -y --no-install-recommends mariadb-client \
    && rm -rf /var/lib/apt/lists/* \
    && docker-php-ext-install pdo_mysql \
    && a2enmod headers rewrite

COPY docker/apache.conf /etc/apache2/conf-available/sis.conf
COPY docker/php.ini /usr/local/etc/php/conf.d/zz-sis.ini
RUN a2enconf sis

COPY . /var/www/html/
RUN mkdir -p /var/www/html/backups \
    && chown -R www-data:www-data /var/www/html/backups

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD php -r 'exit(@file_get_contents("http://127.0.0.1/health.php") === false ? 1 : 0);'

EXPOSE 80
