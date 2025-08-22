import nerdamer from 'nerdamer';
import 'nerdamer/Algebra';
import 'nerdamer/Calculus';
import 'nerdamer/Solve';
import 'nerdamer/Extra';


export default function useMaths() {

    // =================================== NUMERIC ====================================== // 
    // check if numbers are equal (0.02 margin of error)
    const numericEquality = (input: any, answer: any) => {
        const diff = Math.abs(
            Number(input.subtract(answer).evaluate().text())
        )
        if (diff <= 0.02) {
            return true
        }
    }
    // ==================================================================================== //


    // =================================== ALGEBRAIC ====================================== // 
    const algebricEquality = (input: any, answer: any) => {
        return input.eq(answer)
    }
    // ==================================================================================== //

    // =================================== CARTERSIAN ===================================== // 
    const cartesianEquality = (input: any, answer: any) => {

        try {
            const parseCoordinate = (latex: string) => {
                const match = latex.match(/\\left\((.*),(.*)\\right\)/)
                if (!match) return null
                return [
                    nerdamer.convertFromLaTeX(match[1].trim()),
                    nerdamer.convertFromLaTeX(match[2].trim())
                ]
            }

            const inputCoord = parseCoordinate(input)
            const answerCoord = parseCoordinate(answer)

            if (!inputCoord || !answerCoord) {
                return false
            }

            const [xi, yi] = inputCoord
            const [xa, ya] = answerCoord

            // Symbolic equality first
            if (xi.eq(xa) && yi.eq(ya)) {
                return true
            } else {
                // Numeric tolerance
                const diffX = Math.abs(Number(xi.subtract(xa).evaluate().text()))
                const diffY = Math.abs(Number(yi.subtract(ya).evaluate().text()))
                if (diffX <= 0.02 && diffY <= 0.02) {
                    return true
                }
            }

            return false
        }
        catch (err: any) {
            return false
        }
    }

    const isCorrect = (input: string) => {
        const answer = '(5,8)'
        let correct = false

        try {

            // First check cartesian coordinate answers 
            if (cartesianEquality(input,answer))
                return 'match!'
            // Parse LaTeX into nerdamer expressions
            const nodeInput = nerdamer.convertFromLaTeX(input) ?? input 
            const nodeAnswer = nerdamer.convertFromLaTeX(answer) ?? answer 

            // Check symbolic equality first
            if ( numericEquality(nodeInput, nodeAnswer) ||
                algebricEquality(nodeInput, nodeAnswer) ||
                cartesianEquality(input, answer)
            ) correct = true

            return `input: ${nodeInput.toString()}, answer: ${nodeAnswer.toString()}, correct: ${correct}`
        }
        catch (err: any) {
            return err.toString()
        }
    }


    return { isCorrect }
}