# config

```sh
bunx degit eric-k-chu/config/<filename or dirname>
```

# audio pops issue intel

fix
```sh
echo 0 > /sys/module/snd_hda_intel/parameters/power_save
```

persist
```sh
sudo sh -c 'echo "options snd_hda_intel power_save=0" >> /etc/modprobe.d/audio_disable_powersave.conf'
```
