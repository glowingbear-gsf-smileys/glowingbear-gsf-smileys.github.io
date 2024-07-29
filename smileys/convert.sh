#!/bin/bash
started=0
echo "smileys = {" >smileys.json
while read line; do
    if [ "$started" == 0 ]; then
        if [ "$line" == "[default]" ]; then
            started=1
        fi
    else
        words=($line)
        echo "\"${words[1]}\": \"${words[0]}\"," >>smileys.json
    fi
done < theme
echo "}" >>smileys.json
