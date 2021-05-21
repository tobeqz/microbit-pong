function splitStringToArray(str: string): string[] {
    const finalArray = []

    for (let i = 0; i < str.length; i++) {
        finalArray.push(str[i])
    }

    return finalArray
}

function splitStringByCharacter(str:string, separator: string) {
    const finalArray = [""]

    for (const currentChar of splitStringToArray(str)) {
        if (currentChar != separator) {
            finalArray[finalArray.length-1] += currentChar
        } else {
            finalArray.push("")
        }
    }

    return finalArray
}

/* 
 * Deze class is nodig omdat je maximaal 18 bytes
 * aan data kunt sturing via 1 sendString() call
 * dit staat HELEMAAL NERGENS in de documentatie
 * en ik kwam er na iets van 3 uur debuggen achter
 * dus bij deze, een radio wrapper die makecode eigenlijk
 * zelf moet supplyen als ze "beginnner friendly" willen
 * zijn. Het support alleen strings, omdat JSON.parse en
 * JSON.stringify te veel moeite waren voor microsoft
 * om te implementeren.
 */
class RadioWrapper {
    callbacks: Function[]
    constructor(radioGroup: number) {
        radio.setGroup(radioGroup)
        this.callbacks = []

        let full_string = ""
        radio.onReceivedString(slice => {
            full_string += slice
            if (slice[slice.length-1] == "\u{03}") {
                for (const callback of this.callbacks) {
                    callback(full_string.substr(1, full_string.length-1))
                }

                full_string = ""
            }
        })
    }

    sendString(stringToSend: string) {
        const start = String.fromCharCode(2)
        const end = String.fromCharCode(3)
        const string_with_boundary = `${start}${stringToSend}${end}`
        // 02 en 03 staan in ASCII voor start en einde respectievelijk

        for (let i = 0; i < string_with_boundary.length; i += 18) {
            const slice = string_with_boundary.substr(i, 18)
            radio.sendString(slice)
        }
    }
    
    onReceive(callback: Function) {
        this.callbacks.push(callback)        
    }
}

const r = new RadioWrapper(5)


class RadioEvent {
    name: string
    id: number

    constructor(name: string, id: number) {
        this.name = name
        this.id = id 
    }
}

class RadioEventListener {
    event: RadioEvent
    callback: Function

    constructor(event: RadioEvent, callback: Function) {
        this.event = event
        this.callback = callback
    }
}

class RadioEventHandler {
    eventListeners: RadioEventListener[] 
    events: RadioEvent[]
    lastEventId: number

    constructor() {
        this.eventListeners = []
        this.events = []
        this.lastEventId = 0
        radio.onReceivedString(str => {
            // Deserialize
            let eventIdAsStr = ""
            let eventContent = ""

            let foundSeperator = false
            for (const char of str) {
                if (char == "|") {
                     foundSeperator = true
                     continue
                }

                if (foundSeperator) {
                    eventContent += char
                } else {
                    eventIdAsStr += char
                }
            }

            const eventId = parseInt(eventIdAsStr)

            this.fireEventListener(eventId, eventContent)
        })
    }

    on(eventName: string, eventHandler: Function) {
        let event = this.findEvent(eventName);
        // Maak nieuwe listener object aan als deze niet bestaat
        

        if (!event) {
            event = new RadioEvent(eventName, this.lastEventId++) 
            this.events.push(event)
        }
        
        const listener = new RadioEventListener(event, eventHandler)
        this.eventListeners.push(listener)
    }

    private findEvent(identifier: number | string): RadioEvent | false {
        for (const event of this.events) {
            if (event.id === identifier || event.name === identifier) {
                return event
            }
        }

        return false
    }
    // Fire lokale listener
    private fireEventListener(eventId: number, arg: string) {
        // Zoek de correcte listeners op
        
        for (const listener of this.eventListeners) {
            if (listener.event.id == eventId) {
                listener.callback(arg)
            }
        }
    }

    // Fire event op andere microbits
    fireEvent(eventName: string, arg: string) {
        const event = this.findEvent(eventName)

        if (!event) {
            throw "No such event"
        }

        const eventId = event.id
        r.sendString(`${eventId}|${arg}`)        
    }
}

const r_events = new RadioEventHandler()
// Radio handshake zorgt ervoor dat we een client-server model
// kunnen hebben
class RadioHandshake {
    isServer: boolean;
    foundMatch: boolean;

    constructor() {
        this.isServer = false
        this.foundMatch = false
        // Genereer een random nummer
        const microBitId = Math.ceil(Math.random() * 500000)

        r_events.on("handshake_request", (otherMicroBitIdStr: string) => {
            this.foundMatch = true
            const otherMicroBitId = parseInt(otherMicroBitIdStr)
            this.isServer = otherMicroBitId > microBitId
        })

        while (!this.foundMatch) {
            basic.pause(100)

            r_events.fireEvent("handshake_request", microBitId.toString()) 
        }
    }
}

const handshake = new RadioHandshake()

console.log("Got handshake")
