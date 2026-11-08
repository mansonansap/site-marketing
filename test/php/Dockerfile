FROM php:8.3-apache
RUN docker-php-ext-configure mbstring --disable-mbregex && docker-php-ext-install pdo_mysql mbstring && a2enmod rewrite
RUN printf 'upload_max_filesize=10M\npost_max_size=10M\nmemory_limit=128M\ndisplay_errors=Off\n' > /usr/local/etc/php/conf.d/cv.ini
# Test workspace UID only; production HOSTiQ uses the cPanel account owner.
RUN usermod -u 1000 www-data && groupmod -g 1000 www-data
