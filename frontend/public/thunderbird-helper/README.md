# Wellracom CRM Thunderbird Helper

Helper Windows untuk membuka Thunderbird langsung dari CRM dengan:
- To
- CC
- Subject
- Body
- PDF quotation sebagai attachment

## Instalasi

1. Pastikan Mozilla Thunderbird sudah terpasang.
2. Download `Install-WellracomThunderbirdHelper.ps1` dari CRM.
3. Klik kanan file tersebut lalu pilih **Run with PowerShell**.
4. Kembali ke CRM.
5. Pada Quotation klik **Send Email**.
6. Klik **Buka Thunderbird + PDF**.

Helper menggunakan custom protocol `wellracomcrm://` dan token satu kali yang berlaku 10 menit.

Jika helper belum terpasang, gunakan tombol **Download installer Thunderbird Helper** di dialog email.

## Catatan keamanan

Token email desktop hanya berlaku singkat dan hanya memberikan akses ke quotation yang sedang dikirim. PDF tidak dibuat publik secara permanen.
