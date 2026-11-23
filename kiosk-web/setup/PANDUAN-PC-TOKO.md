# Panduan Setup PC Kiosk di Toko

Panduan ini untuk PC/tablet Windows di toko. Setelah semua langkah selesai:

- PC dinyalakan → Windows login sendiri → kiosk langsung terbuka layar penuh.
- Kalau Chrome tertutup atau crash, kiosk terbuka lagi sendiri dalam ±10 detik.
- Setelah pembayaran berhasil, struk langsung keluar dari printer thermal tanpa dialog print.

Waktu yang dibutuhkan: ±30–45 menit. Siapkan:

- [ ] PC kiosk sudah terhubung internet
- [ ] Printer thermal (58 mm atau 80 mm) beserta drivernya
- [ ] `KIOSK_DEVICE_TOKEN` (dari environment Render)
- [ ] Folder `kiosk-web\setup\` dari repo ini (salin lewat flashdisk atau download dari GitHub)
- [ ] **Keyboard (dan mouse) USB/Bluetooth sementara**. Lihat catatan layar sentuh di bawah.

> **Perangkat layar sentuh (mini PC / standing tablet).** Pelanggan cukup pakai sentuhan. PIN panel staf juga diketik lewat keypad di layar kiosk. Tapi selama kiosk berjalan, keyboard sentuh Windows **tidak bisa dibuka** (taskbar tersembunyi dan swipe dari tepi layar dimatikan), dan tidak ada cara keluar dari kiosk hanya dengan sentuhan. Itu disengaja supaya pelanggan tidak bisa keluar. Karena itu:
>
> - **Saat setup** (langkah 1–6): pakai keyboard USB/Bluetooth. Kalau tidak ada, bisa pakai keyboard sentuh Windows (ikon keyboard di taskbar, atau Settings → Personalization → Taskbar → Touch keyboard → Always). Langkah ini dikerjakan sebelum kiosk aktif.
> - **Saat maintenance**: simpan satu keyboard USB murah di toko (laci kasir/gudang), atau pasang remote desktop (lihat bagian Maintenance).

URL kiosk toko ini: **`https://twom-kiosk.onrender.com/?branch=10&paper=58`**

> `paper=58` untuk kertas 58 mm. Kalau printernya 80 mm, ganti jadi `paper=80` di semua perintah di bawah.
>
> **Cabang:** `branch=10` = cabang ID 10 (Jatibening Baru). Selalu pakai **ID angka** cabang, jangan nama. Kalau pakai nama (mis. `branch=jatibening`), sistem mengambil cabang pertama yang namanya mengandung kata itu, jadi bisa nyasar ke cabang Jatibening lama. ID cabang bisa dilihat di admin → Cabang.

---

## 1. Buat akun Windows khusus kiosk

Supaya pelanggan tidak bisa mengakses akun admin/pemilik.

1. **Settings → Accounts → Other users → Add account**.
2. Pilih *I don't have this person's sign-in information* → *Add a user without a Microsoft account*.
3. Nama user: `kiosk`. Beri password (catat, jangan ditempel di PC).
4. Biarkan tipe akun **Standard user** (bukan Administrator).
5. Sign out, lalu login sebagai `kiosk` sekali supaya profilnya dibuat.

## 2. Auto-login ke akun kiosk

Masih di akun admin:

1. Kalau ada, matikan dulu **Settings → Accounts → Sign-in options → "For improved security, only allow Windows Hello sign-in"**.
2. Tekan `Win + R`, ketik `netplwiz`, Enter.
3. Pilih user `kiosk`, **hapus centang** "Users must enter a user name and password to use this computer", lalu OK.
4. Masukkan password akun `kiosk` dua kali.

Kalau centang itu tidak muncul, pakai **Sysinternals Autologon** (gratis dari Microsoft): isi username `kiosk` + password → *Enable*.

✅ Tes: restart PC. Windows harus langsung masuk ke akun `kiosk` tanpa minta password.

## 3. Printer thermal jadi default

Login sebagai `kiosk`:

1. Install driver printer thermal (ikuti CD/driver dari penjual).
2. **Settings → Bluetooth & devices → Printers & scanners**.
3. Matikan **"Let Windows manage my default printer"**.
4. Klik printer thermal → **Set as default**.
5. Klik **Printing preferences** → ukuran kertas 58 mm atau 80 mm (pilih roll/continuous kalau ada).
6. Tes cetak sekali dari Chrome biasa (buka halaman apa saja → `Ctrl + P`):
   - Destination: printer thermal
   - **Margins: None**
   - **Headers and footers: tidak dicentang**
   - Cetak. Kalau hasilnya rapi, lanjut.

## 4. Simpan token kiosk (sekali saja)

Masih sebagai `kiosk`, buka **PowerShell** (Start → ketik PowerShell), lalu jalankan (ganti URL dan token):

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir=C:\kiosk-chrome "https://twom-kiosk.onrender.com/?branch=10&paper=58&token=<KIOSK_DEVICE_TOKEN>"
```

- Chrome terbuka memakai profil khusus kiosk (`C:\kiosk-chrome`). Token tersimpan di profil ini.
- Pastikan katalog produk muncul, lalu tutup Chrome.
- Mulai sekarang URL **tanpa** `&token=...` sudah cukup.

> Keamanan: URL ber-token tercatat di riwayat Chrome dan log Render. Setelah semua PC kiosk siap, ganti `KIOSK_DEVICE_TOKEN` di Render dan ulangi langkah ini dengan token baru.

## 5. Pasang auto-start + watchdog

1. Salin folder `kiosk-web\setup\` ke PC kiosk, misalnya ke `C:\kiosk-setup\`.
2. Masih sebagai `kiosk`, buka PowerShell dan jalankan (URL **tanpa** token):

   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\kiosk-setup\install-autostart.ps1 -Url "https://twom-kiosk.onrender.com/?branch=10&paper=58" -StartNow
   ```

3. Output yang benar diawali `Terpasang.` dan menyebut lokasi shortcut, watchdog, dan Chrome.
4. Kiosk langsung terbuka layar penuh (karena `-StartNow`).

Yang dipasang script ini:

| Apa | Lokasi |
|---|---|
| Shortcut Startup "2M Kiosk" | `shell:startup` milik user `kiosk` |
| Script watchdog | `%LOCALAPPDATA%\2m-kiosk\kiosk-watchdog.ps1` |
| Profil Chrome kiosk (berisi token) | `C:\kiosk-chrome\` |
| Log watchdog | `C:\kiosk-chrome\watchdog.log` |

Saat login, watchdog menunggu internet siap (maksimal ±90 detik), lalu membuka Chrome dengan `--kiosk` (layar penuh) dan `--kiosk-printing` (print tanpa dialog). Setiap 10 detik watchdog mengecek: kalau Chrome kiosk tertutup, Chrome dibuka lagi. Chrome biasa yang dibuka untuk keperluan lain tidak terpengaruh.

## 6. Kunci layar sentuh dan pengaturan Windows

Gunakan akun admin untuk langkah yang perlu admin.

1. **Gestur sentuh**: Settings → Bluetooth & devices → Touch → matikan **Three- and four-finger touch gestures**.
2. **Swipe dari tepi layar** (perlu admin):
   - Windows Pro: `Win + R` → `gpedit.msc` → Computer Configuration → Administrative Templates → Windows Components → Edge UI → **Allow edge swipe = Disabled**.
   - Windows Home: jalankan di PowerShell **Run as administrator**:

     ```powershell
     New-Item -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\EdgeUI" -Force | Out-Null; Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\EdgeUI" -Name AllowEdgeSwipe -Type DWord -Value 0
     ```

3. **Jangan tidur**: Settings → System → Power → Screen & sleep → semua **Never**. Matikan screen saver.
4. **Windows Update**: Settings → Windows Update → **Active hours** (mis. 06:00–22:00). Matikan "Get the latest updates as soon as they're available".
5. **Notifikasi**: Settings → System → Notifications → **Off**, nyalakan Do not disturb.
6. **Keyboard sentuh**: biarkan aktif. Keyboard ini tidak muncul di kiosk karena kiosk tidak punya kolom ketik (PIN staf pakai keypad di layar), dan tetap berguna kalau maintenance tanpa keyboard fisik.
7. **(Disarankan) Remote desktop**: install **Chrome Remote Desktop** (remotedesktop.google.com/access) atau AnyDesk di akun `kiosk`, lalu atur supaya aktif tanpa harus diterima di layar (unattended access). Dengan ini, maintenance bisa dilakukan dari HP/laptop tanpa keyboard di toko. Catat PIN/password remote-nya di tempat aman, jangan ditempel di PC.

## 7. Tes akhir (wajib sebelum toko buka)

- [ ] **Restart PC.** Tanpa menyentuh apa pun: Windows login sendiri → kiosk terbuka layar penuh.
- [ ] **Tes watchdog.** Colok keyboard, tekan `Alt + F4`. Dalam ±10–25 detik kiosk terbuka lagi. (Atau lewat remote desktop: kirim `Alt + F4` dari menu remote.)
- [ ] **Tes layar sentuh.** Cabut keyboard/mouse. Pastikan semua alur bisa dilakukan dengan sentuhan: pilih produk, keranjang, bayar, dan buka panel staf + ketik PIN di keypad layar.
- [ ] **Tes transaksi.** Beli 1 barang murah → bayar QRIS (atau tandai lunas lewat panel staf) → layar "Pembayaran berhasil" → **struk keluar sendiri tanpa dialog**.
- [ ] Stok barang di admin berkurang.
- [ ] Coba swipe dari tepi layar dan gestur 3 jari: tidak ada yang terbuka.

Kalau ada yang gagal, lihat bagian **Masalah umum** di bawah.

---

## Maintenance (staf/pemilik)

Layar sentuh saja tidak cukup untuk keluar dari kiosk. Pakai salah satu:

- **Keyboard USB/Bluetooth** yang disimpan di toko, atau
- **Remote desktop** (langkah 6.7) dari HP/laptop. Kirim tombol `Ctrl + Alt + Del` / `Alt + F4` lewat menu aplikasi remote.

**Keluar dari kiosk sementara** (misalnya untuk update atau ganti setting):

1. Tekan `Ctrl + Alt + Del` → Task Manager → File → Run new task → ketik `powershell -Command New-Item C:\kiosk-chrome\STOP` → OK.

   (Cara lain: `notepad C:\kiosk-chrome\STOP` → Yes → Save. Notepad bisa menyimpannya sebagai `STOP.txt`, dan itu juga dikenali.)
2. Tekan `Alt + F4` untuk menutup kiosk. Kiosk tidak akan terbuka lagi selama file `STOP` ada. Sekarang desktop Windows bisa dipakai, termasuk dengan sentuhan dan keyboard sentuh di taskbar.
3. Kalau sudah selesai, hapus file `C:\kiosk-chrome\STOP` (atau `STOP.txt`) lewat File Explorer. Dalam ±10 detik kiosk terbuka lagi.

**Tanpa keyboard dan tanpa remote, kiosk macet/hang:** tekan tahan tombol power sampai mati, lalu nyalakan lagi. Windows login sendiri dan kiosk terbuka lagi.

**Ganti URL** (pindah cabang, ganti ukuran kertas, ganti domain): jalankan lagi langkah 5 dengan URL baru, lalu restart PC.

**Copot auto-start:**

```powershell
powershell -ExecutionPolicy Bypass -File C:\kiosk-setup\install-autostart.ps1 -Uninstall
```

Profil `C:\kiosk-chrome` (berisi token) tidak ikut terhapus. Hapus manual kalau PC tidak dipakai kiosk lagi.

## Masalah umum

| Gejala | Penyebab & solusi |
|---|---|
| Setelah restart, kiosk tidak terbuka | Cek Windows login ke akun `kiosk` (langkah 2) dan shortcut ada di `shell:startup` (`Win + R` → `shell:startup`). Cek isi `C:\kiosk-chrome\watchdog.log`. Pastikan tidak ada file `C:\kiosk-chrome\STOP`. |
| Muncul dialog print, struk tidak keluar sendiri | Chrome tidak dibuka lewat watchdog (flag `--kiosk-printing` tidak ada). Tutup semua Chrome, hapus file STOP kalau ada, tunggu watchdog membuka ulang. |
| Struk keluar di printer lain atau jadi PDF | Printer thermal bukan default (langkah 3). |
| Struk terpotong atau ada header/URL di kertas | Ulangi tes print di langkah 3: Margins None, Headers and footers mati. Cek `paper=58` atau `paper=80` di URL sesuai kertas. |
| Kiosk minta token / "perangkat tidak dikenal" | Token belum tersimpan atau sudah diganti di Render. Ulangi langkah 4 dengan token terbaru. |
| Halaman error "tidak ada internet" setelah PC nyala | Internet lebih lambat dari 90 detik. Chrome biasanya memuat ulang sendiri saat internet nyambung. Kalau tidak: `Alt + F4` (keyboard/remote) supaya watchdog membuka ulang kiosk, atau restart PC dengan tombol power. |
| Kiosk tidak bisa ditutup untuk maintenance | Itu tugas watchdog. Buat file `STOP` dulu (lihat Maintenance). Tidak bisa dilakukan dengan sentuhan saja: pakai keyboard atau remote desktop. |
| Keyboard sentuh tidak muncul di desktop | Settings → Personalization → Taskbar → Touch keyboard → **Always**, lalu ketuk ikon keyboard di taskbar. |
