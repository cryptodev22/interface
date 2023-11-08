import {
  ReserveDataHumanized,
  ReservesDataHumanized,
  ReservesIncentiveDataHumanized,
} from '@aave/contract-helpers';
import { formatReservesAndIncentives } from '@aave/math-utils';
import { memoize } from 'lodash';
import { reserveSortFn } from 'src/store/poolSelectors';
import { MarketDataType } from 'src/ui-config/marketsConfig';
import { fetchIconSymbolAndName, IconMapInterface } from 'src/ui-config/reservePatches';
import { getNetworkConfig, NetworkConfig } from 'src/utils/marketsAndNetworksConfig';

import { selectBaseCurrencyData, selectReserves } from './selectors';
import { usePoolsReservesHumanized } from './usePoolReserves';
import { usePoolsReservesIncentivesHumanized } from './usePoolReservesIncentives';
import { combineQueries, SimplifiedUseQueryResult } from './utils';

export type FormattedReservesAndIncentives = ReturnType<
  typeof formatReservesAndIncentives
>[number] &
  IconMapInterface & {
    isEmodeEnabled: boolean;
    isWrappedBaseAsset: boolean;
  } & ReserveDataHumanized;

const formatReserves = memoize(
  (
    reservesData: ReservesDataHumanized,
    incentivesData: ReservesIncentiveDataHumanized[],
    networkConfig: NetworkConfig
  ) => {
    const reserves = selectReserves(reservesData);
    const baseCurrencyData = selectBaseCurrencyData(reservesData);
    return formatReservesAndIncentives({
      reserves,
      currentTimestamp: 0,
      marketReferenceCurrencyDecimals: baseCurrencyData.marketReferenceCurrencyDecimals,
      marketReferencePriceInUsd: baseCurrencyData.marketReferenceCurrencyPriceInUsd,
      reserveIncentives: incentivesData,
    })
      .map((r) => ({
        ...r,
        ...fetchIconSymbolAndName(r),
        isEmodeEnabled: r.eModeCategoryId !== 0,
        isWrappedBaseAsset:
          r.symbol.toLowerCase() === networkConfig.wrappedBaseAssetSymbol?.toLowerCase(),
      }))
      .sort(reserveSortFn);
  }
);

export const usePoolsFormattedReserves = (
  marketsData: MarketDataType[]
): SimplifiedUseQueryResult<FormattedReservesAndIncentives[]>[] => {
  const poolsReservesQuery = usePoolsReservesHumanized(marketsData);
  const poolsReservesIncentivesQuery = usePoolsReservesIncentivesHumanized(marketsData);

  return poolsReservesQuery.map((elem, index) => {
    const marketData = marketsData[index];
    const networkConfig = getNetworkConfig(marketData.chainId);
    const selector = (
      reservesData: ReservesDataHumanized,
      incentivesData: ReservesIncentiveDataHumanized[]
    ) => {
      return formatReserves(reservesData, incentivesData, networkConfig);
    };
    return combineQueries([elem, poolsReservesIncentivesQuery[index]] as const, selector);
  });
};

export const usePoolFormattedReserves = (marketData: MarketDataType) => {
  return usePoolsFormattedReserves([marketData])[0];
};
