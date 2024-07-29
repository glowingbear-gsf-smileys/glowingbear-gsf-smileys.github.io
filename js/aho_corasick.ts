declare var smileys_directory: any;
declare var angular: any;
class Trie {
    allowOverlaps: boolean = true;
    private readonly rootState: State;
    constructor() {
        this.rootState = new State();
    }
    addKeyword(keyword: string) {
        this.addState(keyword).addEmit(keyword);
    }
    private addState(keyword: string) : State {
        return this.rootState.addStateString(keyword);
    }
    constructFailureStates() {
        let queue: State[] = [];
        let startState: State = this.rootState;
        let startStateStates: State[] = startState.getStates();
        for (let i = 0; i < startStateStates.length; i++) {
            let depthOneState = startStateStates[i];
            depthOneState.setFailure(startState);
            queue.push(depthOneState);
        }
        while (queue.length != 0) {
            let currentState: State = queue.shift()!;
            let transitions: string[] = currentState.getTransitions();
            for (let i = 0; i < transitions.length; i++) {
                let transition: string = transitions[i];
                let targetState: State = currentState.nextState(transition, false)!;
                queue.push(targetState);
                let traceFailureState: State = currentState.getFailure()!;
                while(traceFailureState.nextState(transition, false) == null) {
                    traceFailureState = traceFailureState.getFailure()!;
                }
                let newFailureState: State = traceFailureState.nextState(transition, false)!;
                targetState.setFailure(newFailureState);
                targetState.addEmits(newFailureState.getEmits());
            }
        }
    }
    private getState(currentState: State, character: string): State {
        let newCurrentState: State | undefined = currentState.nextState(character, false);
        while (newCurrentState == undefined) {
            currentState = currentState.getFailure()!;
            newCurrentState = currentState.nextState(character, false);
        }
        return newCurrentState;
    }
    parseText(text: string): Emit[] {
        let collectedEmits: Emit[] = [];
        let currentState: State = this.rootState;
        for (let i = 0; i < text.length; i++) {
            let character: string = text.charAt(i);
            currentState = this.getState(currentState, character);
            let emits: string[] = currentState.getEmits();
            for (let j = 0; j < emits.length; j++) {
                collectedEmits.push(new Emit(i - emits[j].length + 1, i, emits[j]));
            }
        }
        if (!this.allowOverlaps) {
            let intervalTree: IntervalTree<Emit> = new IntervalTree<Emit>(collectedEmits);
            collectedEmits = intervalTree.removeOverlaps(collectedEmits);
        }
        return collectedEmits;
    }
    tokenize(text: string): Token[] {
        let tokens: Token[] = [];
        let collectedEmits: Emit[] = this.parseText(text);
        let lastCollected: number = -1;
        for (let i = 0; i < collectedEmits.length; i++) {
            if (collectedEmits[i].getStart() - lastCollected > 1) {
                tokens.push(this.createFragment(collectedEmits[i], text, lastCollected));
            }
            tokens.push(this.createMatch(collectedEmits[i], text));
            lastCollected = collectedEmits[i].getEnd();
        }
        if (text.length - lastCollected > 1) {
            tokens.push(this.createFragment(null, text, lastCollected));
        }
        return tokens;
    }
    private createFragment(emit: Emit | null, text: string, lastCollectedPosition: number): Token {
        return Token.fragmentToken(text.substring(lastCollectedPosition + 1,
            emit == null ? text.length : emit.getStart()));
    }

    private createMatch(emit: Emit, text: string): Token {
        return Token.matchToken(text.substring(emit.getStart(), emit.getEnd() + 1), emit);
    }

}
class TrieBuilder {
    private readonly trie: Trie = new Trie();
    ignoreOverlaps() : TrieBuilder {
        this.trie.allowOverlaps = false;
        return this;
    }
    addKeyword(keyword: string) : TrieBuilder {
        this.trie.addKeyword(keyword);
        return this;
    }
    build() : Trie {
        this.trie.constructFailureStates();
        return this.trie;
    }
}

class State {
    private readonly depth: number;
    private readonly rootState: State | null = null;
    private readonly success: Map<string, State> = new Map();
    private failure: State | null = null;
    private emits: Set<string> = new Set();
    constructor(depth: number = 0) {
        this.depth = depth;
        this.rootState = depth == 0 ? this : null;
    }

    addStateString(keyword: string) : State {
        let state: State = this;
        for (let i = 0; i < keyword.length; i++) {
            state = state.addStateCharacter(keyword.charAt(i));
        }
        return state;
    }
    addStateCharacter(character: string) : State {
        let nextState: State | undefined = this.nextState(character, true);
        if (nextState == undefined) {
            nextState = new State(this.depth + 1);
            this.success.set(character, nextState);
        }
        return nextState;

    }
    nextState(character: string, ignoreRoot: boolean) : State | undefined {
        let nextState : State | undefined = this.success.get(character);
        if (!ignoreRoot && nextState == undefined && this.rootState != null) {
            nextState = this.rootState;
        }
        return nextState;
    }
    addEmit(keyword: string) {
        this.emits.add(keyword);
    }
    addEmits(emits: string[]) {
        for (let i = 0; i < emits.length; i++) {
            this.addEmit(emits[i]);
        }
    }
    getStates(): State[] {
        return Array.from(this.success.values());
    }
    setFailure(fail: State) {
        this.failure = fail;
    }
    getTransitions(): string[] {
        return Array.from(this.success.keys());
    }
    getFailure(): State | null {
        return this.failure;
    }
    getEmits(): string[] {
        return Array.from(this.emits.values());
    }
}
class Interval {
    private readonly start: number;
    private readonly end: number;
    constructor(start: number, end: number) {
        this.start = start;
        this.end = end;
    }
    getStart(): number {
        return this.start;
    }
    getEnd(): number {
        return this.end;
    }
    size(): number {
        return this.end - this.start + 1;
    }

    overlapsWith(other: Interval): boolean {
        return this.start <= other.getEnd() &&
                this.end >= other.getStart();
    }

    overlapsWithPoint(point: number): boolean {
        return this.start <= point && point <= this.end;
    }

    compareTo(o: Interval) {
        let comparison: number = this.start - o.getStart();
        return comparison != 0 ? comparison : this.end - o.getEnd();
    }
}
class Emit extends Interval {
    private readonly keyword: string;
    constructor(start: number, end: number, keyword: string) {
        super(start, end);
        this.keyword = keyword;
    }
    getKeyword(): string {
        return this.keyword;
    }
}
class Token {
    private fragment: string;
    private emit: Emit | undefined;
    private match: boolean;
    private constructor(fragment: string, emit: Emit | undefined) {
        this.fragment = fragment;
        this.emit = emit;
        this.match = emit != undefined;
    }
    static fragmentToken(fragment: string): Token {
        return new Token(fragment, undefined);
    }
    static matchToken(fragment: string, emit: Emit): Token {
        return new Token(fragment, emit);
    }
    getEmit(): Emit {
        return this.emit!;
    }
    getFragment(): string {
        return this.fragment;
    }
    isMatch(): boolean {
        return this.match;
    }
}
class IntervalTree<T extends Interval> {
    private readonly rootNode: IntervalNode<T>;
    constructor(intervals: T[]) {
        this.rootNode = new IntervalNode(intervals);
    }
    removeOverlaps(intervals: T[]): T[] {
        intervals.sort((a, b) => {
            let cmp1: number = b.size() - a.size();
            if (cmp1 == 0) {
                cmp1 = a.getStart() - b.getStart();
            }
            return cmp1;
        });
        let removeIntervals: Set<T> = new Set();
        for (let i = 0; i < intervals.length; i++) {
            let interval: T = intervals[i];
            if (removeIntervals.has(interval)) {
                continue;
            }
            this.rootNode.findOverlaps(interval).forEach((a) => removeIntervals.add(a));
        }
        intervals = intervals.filter((a) => !removeIntervals.has(a));
        intervals.sort((a,b) => {
            return a.getStart() - b.getStart();
        });
        return intervals;
    }
}
class IntervalNode<T extends Interval> {
    private point: number;
    private left: IntervalNode<T> | null = null;
    private right: IntervalNode<T> | null = null;
    private intervals: T[] = [];

    constructor(intervals: T[]) {
        this.point = this.determineMedian(intervals);
        let toLeft: T[] = [];
        let toRight: T[] = [];
        for (let i = 0; i < intervals.length; i++) {
            let interval = intervals[i];
            if (interval.getEnd() < this.point) {
                toLeft.push(interval);
            } else if (interval.getStart() > this.point) {
                toRight.push(interval);
            } else {
                this.intervals.push(interval);
            }
        }
        if (toLeft.length > 0) {
            this.left = new IntervalNode<T>(toLeft);
        }
        if (toRight.length > 0) {
            this.right = new IntervalNode<T>(toRight);
        }
    }
    private determineMedian(intervals: T[]): number {
        let start: number = -1;
        let end: number = -1;
        for (let i = 0; i < intervals.length; i++) {
            var interval = intervals[i];
            let currentStart: number = interval.getStart();
            let currentEnd: number = interval.getEnd();
            if (start == -1 || currentStart < start) {
                start = currentStart;
            }
            if (end == -1 || currentEnd > end) {
                end = currentEnd;
            }
        }
        return (start + end) / 2;
    }
    findOverlaps(interval: T): T[] {
        let overlaps: T[] = [];

        if (this.point < interval.getStart()) {
            this.addToOverlaps(interval, overlaps, this.findOverlappingRanges(this.right, interval));
            this.addToOverlaps(interval, overlaps, this.checkForOverlaps(interval, 1));
        } else if (this.point > interval.getEnd()) {
            this.addToOverlaps(interval, overlaps, this.findOverlappingRanges(this.left, interval));
            this.addToOverlaps(interval, overlaps, this.checkForOverlaps(interval, -1));
        } else {
            this.addToOverlaps(interval, overlaps, this.intervals);
            this.addToOverlaps(interval, overlaps, this.findOverlappingRanges(this.left, interval));
            this.addToOverlaps(interval, overlaps, this.findOverlappingRanges(this.right, interval));
        }
        return overlaps;
    }

    private addToOverlaps(interval: T, overlaps: T[], newOverlaps: T[]) {
        for (let i = 0; i < newOverlaps.length; i++) {
            let currentInterval: T = newOverlaps[i];
            if (currentInterval != interval) {
                overlaps.push(currentInterval);
            }
        }
    }
    private checkForOverlaps(interval: T, direction: number): T[] {
        let overlaps: T[] = [];
        for (let i = 0; i < this.intervals.length; i++) {
            let currentInterval: T = this.intervals[i];
            if (direction == -1) {
                if (currentInterval.getStart() <= interval.getEnd()) {
                        overlaps.push(currentInterval);
                }
            }
            if (direction == 1) {
                if (currentInterval.getEnd() >= interval.getStart()) {
                    overlaps.push(currentInterval);
                }
            }
        }
        return overlaps;
    }
    private findOverlappingRanges(node: IntervalNode<T> | null, interval: T): T[] {
        return node == null ? [] : node.findOverlaps(interval);
    }
}
(function() {
    let weechat = angular.module("weechat");
    weechat.filter("gsf_smileys", function() : (text: string) => string {
        let trieBuilder: TrieBuilder = new TrieBuilder().ignoreOverlaps();
        Object.keys(smileys_directory).forEach((k, v) => {
            trieBuilder.addKeyword(k);
        });
        let trie: Trie = trieBuilder.build();
        return function(text: string) {
            let tokens: Token[] = trie.tokenize(text);
            let result: string[] = [];
            for (let i = 0; i < tokens.length; i++) {
                let token: Token = tokens[i];
                if (token.isMatch()) {
                    let replacement = '<img src="smileys/' + smileys_directory[token.getFragment()] + '" alt="' + token.getFragment() + '">';
                    result.push(replacement);
                } else {
                    result.push(token.getFragment());
                }
            }
            return result.join("");
        }
    });
})();
