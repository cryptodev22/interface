import { InterestRate } from '@aave/contract-helpers';
import { USD_DECIMALS, valueToBigNumber } from '@aave/math-utils';
import { Trans } from '@lingui/macro';
import { useRef, useState } from 'react';
import {
  ComputedReserveData,
  ComputedUserReserveData,
  useAppDataContext,
} from 'src/hooks/app-data-provider/useAppDataProvider';
import { useModalContext } from 'src/hooks/useModal';
import { useProtocolDataContext } from 'src/hooks/useProtocolDataContext';
import { useSwap } from 'src/hooks/useSwap';
import { useWeb3Context } from 'src/libs/hooks/useWeb3Context';
import { Asset, AssetInput } from '../AssetInput';
import { ModalWrapperProps } from '../FlowCommons/ModalWrapper';
import {
  DetailsHFLine,
  DetailsNumberLineWithSub,
  TxModalDetails,
} from '../FlowCommons/TxModalDetails';
import { CollateralRepayActions } from './CollateralRepayActions';
import BigNumber from 'bignumber.js';
import { calculateHFAfterRepay } from 'src/utils/hfUtils';

export function CollateralRepayModalContent({
  poolReserve,
  symbol,
  debtType,
  userReserve,
  isWrongNetwork,
}: ModalWrapperProps & { debtType: InterestRate }) {
  const { user, marketReferencePriceInUsd, reserves } = useAppDataContext();
  const { gasLimit } = useModalContext();
  const { currentChainId } = useProtocolDataContext();
  const { currentAccount } = useWeb3Context();
  const repayTokens = user.userReservesData
    .filter((userReserve) => userReserve.underlyingBalance !== '0')
    .map((userReserve) => ({
      address: userReserve.underlyingAsset,
      balance: userReserve.underlyingBalance,
      symbol: userReserve.reserve.symbol,
      iconSymbol: userReserve.reserve.iconSymbol,
      aToken: true,
    }));
  const [tokenToRepayWith, setTokenToRepayWith] = useState<Asset>(repayTokens[0]);

  const repayWithReserve = reserves.find(
    (reserve) => reserve.underlyingAsset === tokenToRepayWith.address
  ) as ComputedReserveData;

  const [_amount, setAmount] = useState('');
  const [maxSlippage, setMaxSlippage] = useState('0.1');

  const amountRef = useRef<string>('');

  const debt =
    debtType === InterestRate.Stable ? userReserve.stableBorrows : userReserve.variableBorrows;
  const safeAmountToRepayAll = valueToBigNumber(debt).multipliedBy('1.0025');

  const isMaxSelected = _amount === '-1';
  const amount = isMaxSelected ? safeAmountToRepayAll.toString() : _amount;
  const usdValue = valueToBigNumber(amount).multipliedBy(poolReserve.priceInUSD);

  const { priceRoute, inputAmountUSD, inputAmount, outputAmount, outputAmountUSD } = useSwap({
    chainId: currentChainId,
    userId: currentAccount,
    variant: 'exactOut',
    swapIn: { ...repayWithReserve, amount: '0' },
    swapOut: { ...poolReserve, amount: amountRef.current },
    max: isMaxSelected,
  });

  const amountAfterRepay = valueToBigNumber(debt).minus(amount || '0');
  const displayAmountAfterRepayInUsd = amountAfterRepay
    .multipliedBy(poolReserve.formattedPriceInMarketReferenceCurrency)
    .multipliedBy(marketReferencePriceInUsd)
    .shiftedBy(-USD_DECIMALS);


  const minimumReceived = new BigNumber(outputAmount || '0')
    .multipliedBy(new BigNumber(100).minus(maxSlippage).dividedBy(100))
    .toString(10);


  const handleChange = (value: string) => {
    const maxSelected = value === '-1';
    amountRef.current = maxSelected ? safeAmountToRepayAll.toString() : value;
    setAmount(value);
  };

  // for v3 we need hf after withdraw collateral, because when removing collateral to repay
  // debt, hf could go under 1 then it would fail. If that is the case then we need
  // to use flashloan path
  const { hfAfterSwap, hfEffectOfFromAmount } = calculateHFAfterRepay({
    fromAmountAfterSlippage: minimumReceived,
    fromAssetData: poolReserve,
    user,
    amountToRepay: amount,
    toAssetData: poolReserve,
    userReserve,
  });

  const shouldUseFlashloan =
    user.healthFactor !== '-1' &&
    new BigNumber(user.healthFactor).minus(hfEffectOfFromAmount).lt('1.05');

  const blockingError = undefined;

  return (
    <>
      <AssetInput
        value={amount}
        onChange={handleChange}
        usdValue={usdValue.toString()}
        symbol={tokenToRepayWith.symbol}
        assets={[
          {
            address: poolReserve.underlyingAsset,
            symbol: poolReserve.symbol,
            iconSymbol: poolReserve.iconSymbol,
            balance: debt,
          },
        ]}
        isMaxSelected={isMaxSelected}
        maxValue={debt}
      />
      <AssetInput
        value={inputAmount}
        usdValue={inputAmountUSD}
        symbol={tokenToRepayWith.symbol}
        assets={repayTokens}
        onSelect={setTokenToRepayWith}
        disableInput
      />
      <TxModalDetails gasLimit={gasLimit}>
        <DetailsNumberLineWithSub
          description={<Trans>Remaining debt</Trans>}
          futureValue={amountAfterRepay.toString()}
          futureValueUSD={displayAmountAfterRepayInUsd.toString()}
          symbol={symbol}
        />
        <DetailsHFLine
          visibleHfChange={!!_amount}
          healthFactor={user?.healthFactor}
          futureHealthFactor={'2' /** TODO */}
        />
      </TxModalDetails>
      <CollateralRepayActions
        poolReserve={poolReserve}
        repayWithReserve={repayWithReserve}
        amountToRepay={isMaxSelected ? safeAmountToRepayAll.toString() : amount}
        amountToSwap={outputAmount}
        isMaxSelected={isMaxSelected}
        useFlashLoan={shouldUseFlashloan}
        isWrongNetwork={isWrongNetwork}
        symbol={symbol}
        debtType={debtType}
        priceRoute={priceRoute}
        blocked={blockingError !== undefined}
      />
    </>
  );
}
