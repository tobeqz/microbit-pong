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
 * Natuurlijk kun je ook maar 1 callback bij de standaard
 * radio module, dus ik doe weer even microsoft's werk
 */
class BetterRadio {
    callbacks: Function[]    

    constructor() {
        this.callbacks = []

        radio.onReceivedString((str: string) => {
            for (const callback of this.callbacks) {
                callback(str)
            }
        })
    }

    onReceivedString(callback: Function) {
        this.callbacks.push(callback)
    }
}

const b_radio = new BetterRadio()

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
        b_radio.onReceivedString((slice: string) => {
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
        r.onReceive((str: string) => {
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

    registerEvent(eventName: string) {
        this.events.push(new RadioEvent(eventName, this.lastEventId++))
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
b_radio.onReceivedString((str: string) => {
    console.log(str)
})

const handshake = new RadioHandshake()
console.log("Am I server? " + handshake.isServer)

class Coord {
    x: number
    y: number
    
    constructor(x: number, y: number) {
        this.x = x 
        this.y = y
    }
}

class Movable extends Coord {
    constructor(x: number, y: number) {
        super(x, y)
    }

    moveX(offset: number) {
        this.x = this.x + offset
    }

    moveY(offset: number) {
        this.y = this.y + offset
    }
}

class Player extends Movable {
    constructor(x: number, y: number) {
        super(x, y)
    }
}

class Ball extends Movable {
    position: Coord
    velocity: number // Alleen in x

    constructor(x: number, y: number, velocity: number) {
        super(x, y)
        this.velocity = velocity
    }
}

class MicroPong {
    p1: Player
    p2: Player
    ownPlayer: Player
    ball: Ball
    ballInterval: number // Aantal seconden hoe lang het de bal duurt om 1 pixel te bewegen

    constructor() {
        this.p1 = new Player(0, 0)        
        this.p2 = new Player(9, 0)
        this.ball = new Ball(5, 0, 1)
        this.ownPlayer = handshake.isServer ? this.p1 : this.p2

        r_events.registerEvent("render")
        r_events.registerEvent("player_position_update")

        input.onButtonPressed(Button.A, () => {
            this.ownPlayer.moveY(-1)
            if (!handshake.isServer) {
                r_events.fireEvent("player_position_update", this.ownPlayer.y.toString())
            }
        })

        input.onButtonPressed(Button.B, () => {
            this.ownPlayer.moveY(1)
            if (!handshake.isServer) {
                r_events.fireEvent("player_position_update", this.ownPlayer.y.toString())
            }
        })

        if (handshake.isServer) { // Server event listeners
            r_events.on("player_position_update", (pos_as_str: string) => {
                // Player 2's x coord is altijd 9
                this.p2.y = parseInt(pos_as_str)
            })
        } 

        control.inBackground(() => {
            while (true) {
                control.wait(this.ballInterval*1000000)
                this.ball.moveX(this.ball.velocity)
            }
        })
    }

    render() {
        // Server is altijd player 1, de linker speler
        const x_offset = handshake.isServer ? 0 : 5

        basic.clearScreen()
        
        led.plot(this.p1.x - x_offset, this.p1.y)
        led.plot(this.p2.x - x_offset, this.p2.y)
        led.plot(this.ball.x - x_offset, this.ball.y)
    }
}

const pong = new MicroPong()

basic.forever(() => {
    pong.render()
})
