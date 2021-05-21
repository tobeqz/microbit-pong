// Ik heb bewust gekozen om het spel van pong een beetje aan te passen
// normaal gaat het balletje in een bepaalde hoek de andere kant op,
// afhankelijk van de snelheid waarmee je heb raakt. Dit is op
// zo'n klein scherm als deze eigenlijk onmogelijk omdat er niet
// echt een snelheid bestaat van de player. Ook is het als speler
// heel moeilijk om in te schatten waar het balletje heen gaat in de volgende
// frame, waardoor het moeilijk wordt om hem te weerkaatsen.
//
// In plaats van de standaard pong, hebben we MicroPong gemaakt (zelf bedacht)
// De bal heeft een bepaalde snelheid (pong.ballInterval) en deze wordt sneller
// naarmate je vaker het balletje heen en weer speelt. Ook gaat het balletje elke
// keer in een rechte lijn, parallel tot de x-as. Elke keer als je de bal
// weerkaatst, wordt de y positie gerandomized en de velocity omgedraaid.


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

        // Call alle callbacks die toegevoegd zijn
        radio.onReceivedString((str: string) => {
            for (const callback of this.callbacks) {
                callback(str)
            }
        })
    }

    onReceivedString(callback: Function) {
        // Voeg callback toe aan lijst met listeners
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
            // Voeg deze slice aan de uiteindelijke message toe
            full_string += slice
            if (slice[slice.length-1] == "\u{03}") {
                // Call alle callbacks met de uiteindelijke string - de start en end bytes
                for (const callback of this.callbacks) {
                    callback(full_string.substr(1, full_string.length-2))
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
            // Maximale lengte is 18 bytes, dus deel de string op in stukjes van 18 chars
            // Dit is de reden dat UTF-8 niet supported is door deze
            // radio class. een UTF-8 char is langer dan 1 byte.
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

// Events zullen geserialized worden als:
// ${eventId}|${eventContent}
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

    // Dit is nodig zodat allebei de microbits dezelfde ID's associeren
    // met dezelfde event names.
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
// kunnen hebben. Wat hier gebeurt, is dat allebei de microbits
// een random nummer genereren, de microbit met het lagere nummer
// zal server zijn. Ik wilde eerst iets implementeren zodat
// het rekenening zou houden met de mogelijkheid dat er
// dezelfde nummers gegenereerd zou kunnen worden, maar die kans is
// 4*10^-9 % en dus vond ik het onnodig
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

        // De while loop zorgt ervoor dat de game niet start voordat
        // er een andere microbit is gevonden
        while (!this.foundMatch) {
            basic.pause(100)

            r_events.fireEvent("handshake_request", microBitId.toString()) 
        }
    }
}

const handshake = new RadioHandshake()
console.log(`Am I server? ${handshake.isServer}`)

// De grid is 5x10 en wordt onderverdeeld tussen 2 microbits

// x ->
// 0 1 2 3 4  5 6 7 8 9 
// x x x x x  x x x x x 0 
// x x x x x  x x x x x 1 y
// x x x x x  x x x x x 2 
// x x x x x  x x x x x 3 |
// x x x x x  x x x x x 4 v
// |-------|  |-------|
//  SERVER     CLIENT

class Coord {
    x: number
    y: number
    
    constructor(x: number, y: number) {
        this.x = x 
        this.y = y
    }

    toIndex() {
        return this.y * 10 + this.x
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
    gameEnded: boolean

    constructor() {
        this.p1 = new Player(0, 0) // Server
        this.p2 = new Player(9, 0) // Client
        this.ball = new Ball(1, 0, 1)
        this.ownPlayer = handshake.isServer ? this.p1 : this.p2
        this.ballInterval = 1
        this.gameEnded = false

        r_events.registerEvent("player_position_update") // Dit event wordt door de client gebruikt om aan de server te laten weten waar player 2 (de client) is
        r_events.registerEvent("ball_position_update") // Dit event is om aan de client te laten weten waar de bal is
        r_events.registerEvent("end_game") // Dit is om de client te laten weten wanneer de game afgelopen is

        input.onButtonPressed(Button.A, () => {
            if (this.ownPlayer.y === 0) {
                return
            }

            this.ownPlayer.moveY(-1)
            if (!handshake.isServer) {
                r_events.fireEvent("player_position_update", this.ownPlayer.y.toString())
            }
        })

        input.onButtonPressed(Button.B, () => {
            if (this.ownPlayer.y === 4) {
                return
            }
            
            this.ownPlayer.moveY(1)
            if (!handshake.isServer) {
                r_events.fireEvent("player_position_update", this.ownPlayer.y.toString())
            }
        })

        if (handshake.isServer) { // Server event listeners
            r_events.on("player_position_update", (pos_as_str: string) => {
                this.p2.y = parseInt(pos_as_str)
            })
        } else {
            r_events.on("ball_position_update", (pos: string) => {
                const [x, y] = splitStringByCharacter(pos, "/")
                this.ball.x = parseInt(x)
                this.ball.y = parseInt(y)
            })

            r_events.on("end_game", (msg: string) => {
                console.log("Got end game request")
                this.endGame(msg)
            })
        }

    }

    render() {
        if (this.gameEnded) {
            return
        }

        // Server is altijd player 1, de linker speler
        const x_offset = handshake.isServer ? 0 : 5

        basic.clearScreen()
        
        led.plot(this.p1.x - x_offset, this.p1.y)
        led.plot(this.p2.x - x_offset, this.p2.y)
        led.plot(this.ball.x - x_offset, this.ball.y)
    }

    endGame(msg: string) {
        this.gameEnded = true
        basic.showString(msg)
        control.reset()
    }
}

const pong = new MicroPong()
let bounceCount = 0

let lastBallTick = control.millis()
basic.forever(() => {
    if (control.millis() - lastBallTick > pong.ballInterval * 1000 && handshake.isServer) { // De server doet alle simulaties en berekeningen, de client stuur alleen zijn bewegingen naar de server en rendert zijn kant van het scherm
        pong.ball.moveX(pong.ball.velocity)

        if (pong.ball.x === 9 || pong.ball.x === 0) {
            const ballIdx = pong.ball.toIndex()
            const p1Idx = pong.p1.toIndex()
            const p2Idx = pong.p2.toIndex()

            if (ballIdx == p1Idx || ballIdx == p2Idx) {
                // Bal gaat precies de andere kant op en beweegt naar een willekeurig y coördinaat
                pong.ball.velocity = -pong.ball.velocity
                pong.ball.y = Math.round(Math.random() * 4)
                
                // Maak de bal sneller
                pong.ballInterval = 1 / (0.5*bounceCount + 1)

                pong.ball.moveX(pong.ball.velocity)
                bounceCount++
            } else {
                const winning_player = ballIdx === p1Idx ? pong.p1 : pong.p2 

                if (winning_player !== pong.ownPlayer) {
                    r_events.fireEvent("end_game", `Verloren! (${bounceCount})`)
                    basic.pause(30)
                    pong.endGame(`Gewonnen! (${bounceCount})`)
                } else {
                    r_events.fireEvent("end_game", `Gewonnen! (${bounceCount})`)
                    basic.pause(30)
                    pong.endGame(`Verloren! (${bounceCount})`)
                }
            }
        }

        r_events.fireEvent("ball_position_update", `${pong.ball.x}/${pong.ball.y}`)
        lastBallTick = control.millis()
    }

    pong.render()
})
