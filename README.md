# dotfiles

```sh
bunx degit eric-k-chu/dotfiles/<filename or dirname>
```

# audio pops issue intel ubuntu

fix
```sh
echo 0 > /sys/module/snd_hda_intel/parameters/power_save
```

persist
```sh
sudo sh -c 'echo "options snd_hda_intel power_save=0" >> /etc/modprobe.d/audio_disable_powersave.conf'
```

# bg

[city](https://ibb.co/kmbBdNG)
