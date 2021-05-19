/**
 * Bij lager
 */
/**
 * Vergelijk senderIds
 */
/**
 * Lagere senderId is de server
 */
/**
 * Bij hoger senderId, stuur inputs naar server en ontvang pong bal positie en
 */

/**
 * Vind andere micro:bit
 */

import log from "./mod.ts"

log("MODULE")

console.log("Lolt ")

interface Coord {
    x: number
    y: number
}

interface Vec {
    x: number
    y: number
}

const microBitId = Math.ceil(Math.random() * 500000)

function toRad(inp: number):number {
    return inp * Math.PI/180
}

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

function renderPlayer() {
    if (amIServer) {
        const player1X = 0
        const player1Y = [player1Location, player1Location + 1]

        for (const xCoord of player1Y) {
            led.plot(player1X, xCoord)
        }
    } else {
        const player2X = 4
        const player2Y = [player2Location, player2Location + 1]

        for (const xCoord of player2Y) {
            led.plot(player2X, xCoord)
        }
    }
}



let foundOtherMicroBit = false
let amIServer = false

let player1Location = 0
let player2Location = 1

const ballPosition: Coord = {
    x: 0,
    y: 3
}

const ballVec: Vec = {
    x: 1,
    y: 0
}

// Ball positie:
// 0 0 0 0 | 0 0 0 0
// 0 0 0 0 | 0 0 0 0
// 0 0 0 0 | 0 0 0 0
// 0 0 0 0 | 0 0 1 0
// 0 0 0 0 | 0 0 0 0
// Linker en rechter kolommen zijn van speler

function renderBall() {
    // Eerst afronden naar int
    const intX = Math.floor(ballPosition.x)
    const intY = Math.floor(ballPosition.y)

    if (intY >= 0 && intY < 5) {
        if (amIServer) {
            if (intX < 4 && intX >=0) {
                led.plot(intX + 1, intY)
            }
        } else {
            if (intX > 3 && intX < 8) {
                led.plot(intX - 4, intY)
            }
        }
    }
    
}

// Request Types:
// 1: poll
// 2: poll response
// 3: player update
// 5: input from client
// 6: ball x coord
// 7: ball y coord

const startTime = control.millis()
let lastFrameTimestamp = control.millis()

const ballspeed = 5 // LEDs/second

basic.forever(() => {
    // Als het werkt werkt het
    if (!foundOtherMicroBit) {
        radio.sendString(`1:${microBitId}`)
        return
    }

    // Kijk of de tijd sinds de laatste frame render lang genoeg is om een nieuwe frame te renderen
    const deltaTime = control.millis() - lastFrameTimestamp

    if (deltaTime > 1000/ballspeed && amIServer) {
        lastFrameTimestamp = control.millis()


        ballPosition.x += ballVec.x
        ballPosition.y += ballVec.y

        console.log(`Changing position ${ballPosition.x} ${ballPosition.y} ${ballVec.x} ${ballVec.y}`)


        // console.log(`${ballPosition.x}, ${ballPosition.y}`)

        if (ballPosition.y > 4 || ballPosition.y < 0) {
            console.log("Y TOO IDK OUT OF BOUNDS")
            ballVec.y = -ballVec.y
            ballPosition.y = ballPosition.y > 4 ? Math.ceil(ballPosition.y) : Math.ceil(ballPosition.y)
            ballPosition.y += ballVec.y
        }

        if (ballPosition.x > 7) {
            console.log("Reached right boundary")
            const randomAngle = -(Math.ceil(Math.random() * 90) + 45)
            // const randomAngle = -111

            console.log(randomAngle)

            const x = Math.cos(toRad(randomAngle))
            const y = Math.sin(toRad(randomAngle))

            console.log 

            ballVec.y = y
            ballVec.x = x

            ballPosition.x = Math.floor(ballPosition.x)
            ballPosition.y = Math.floor(ballPosition.x)
        }

        if (ballPosition.x < 0) {
            console.log("REached left boundary")
            const randomAngle = Math.ceil(Math.random() * 90) + 45
            console.log(randomAngle)

            const x = Math.cos(toRad(randomAngle))
            const y = Math.sin(toRad(randomAngle))

            if (x < 0) {
                console.log('AAAAAAAA x<0')
            }


            ballVec.y = y
            ballVec.x = x

            ballPosition.x = Math.ceil(ballPosition.x)
            ballPosition.y = Math.ceil(ballPosition.x)
        }

        radio.sendString(`6:${ballPosition.x}`)
        radio.sendString(`7:${ballPosition.y}`)
    }

    if (amIServer) {
        radio.sendString(`3:${player2Location}`)
    }

    basic.clearScreen()
    renderPlayer()
    renderBall()
})

input.onButtonPressed(Button.A, () => {
    if (amIServer) {
        player1Location--
    } else {
        radio.sendString(`5:A`)
    }
})

input.onButtonPressed(Button.B, () => {
    if (amIServer) {
        player1Location++
    } else {
        radio.sendString(`5:B`)
    }
})

// Request Types:
// 1: poll
// 2: poll response
// 3: player update
// 4: ball update

radio.onReceivedString(str => {
    const strSplit = splitStringByCharacter(str, ":")
    const inputType = strSplit[0]
    const input = strSplit[1]

    if (inputType == "1") {
        console.log("Got poll request from: " + strSplit[1])
        radio.sendString(`2:${microBitId}`)
    }

    if (inputType == "2") {
        console.log("got poll response from: " + strSplit[1])
        const otherMicroBitId = parseInt(strSplit[1])
        foundOtherMicroBit = true

        if (microBitId < otherMicroBitId) {
            // console.log(`I am server ${microBitId}`)
            // basic.showNumber(1)
            amIServer = true
        }
    }

    if (inputType == "3") {
        player2Location = parseInt(input)
    }

    if (inputType == "5" && amIServer) {
        if (input == "A") {
            player2Location--
        } else {
            player2Location++
        }
    }

    if (inputType == "6") {
        ballPosition.x = parseInt(input)
    }

    if (inputType == "7") {
        ballPosition.y = parseInt(input)
    }
})
